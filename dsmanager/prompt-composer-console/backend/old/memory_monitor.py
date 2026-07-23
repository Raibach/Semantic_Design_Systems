"""
Memory Monitor & Diagnostic System for Grace AI
Standard debugging and logging for memory usage tracking
"""

import psutil
import os
import sys
import time
import traceback
from datetime import datetime
from typing import Dict, List, Optional, Any
from collections import defaultdict
import json
from pathlib import Path

class MemoryMonitor:
    """
    Memory usage monitoring and diagnostics system
    Tracks memory consumption per operation and identifies leaks
    """
    
    def __init__(self, log_dir: str = "logs/memory"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.process = psutil.Process(os.getpid())
        self.baseline_memory = self._get_current_memory()
        self.operation_history: List[Dict] = []
        self.peak_memory = self.baseline_memory
        self.operation_counts = defaultdict(int)
        self.operation_memory = defaultdict(list)
        self.start_time = time.time()
        
        # Memory thresholds (in MB)
        self.WARNING_THRESHOLD = 500  # 500 MB
        self.CRITICAL_THRESHOLD = 2000  # 2 GB
        self.EMERGENCY_THRESHOLD = 5000  # 5 GB
        
        # Limits to prevent unbounded memory growth
        self.MAX_OPERATION_HISTORY = 1000  # Keep last 1000 operations
        self.MAX_OPERATION_MEMORY = 100    # Keep last 100 per operation type
        
    def _get_current_memory(self) -> float:
        """Get current memory usage in MB"""
        try:
            mem_info = self.process.memory_info()
            return mem_info.rss / (1024 * 1024)  # Convert to MB
        except Exception:
            return 0.0
    
    def _get_system_memory(self) -> Dict[str, float]:
        """Get system-wide memory stats"""
        try:
            mem = psutil.virtual_memory()
            return {
                'total_gb': mem.total / (1024 ** 3),
                'available_gb': mem.available / (1024 ** 3),
                'used_gb': mem.used / (1024 ** 3),
                'percent': mem.percent
            }
        except Exception:
            return {}
    
    def draw_card(self, operation: str, details: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Draw a memory tarot card - reveals memory state for an operation
        Returns a diagnostic card with memory insights
        """
        before_memory = self._get_current_memory()
        operation_start = time.time()
        
        # Track operation
        self.operation_counts[operation] += 1
        
        try:
            # Execute operation (this is a context manager pattern)
            yield {
                'operation': operation,
                'before_memory_mb': before_memory,
                'start_time': operation_start
            }
            
        finally:
            after_memory = self._get_current_memory()
            duration = time.time() - operation_start
            memory_delta = after_memory - before_memory
            
            # Update peak
            if after_memory > self.peak_memory:
                self.peak_memory = after_memory
            
            # Store operation data
            card = {
                'operation': operation,
                'timestamp': datetime.now().isoformat(),
                'before_memory_mb': round(before_memory, 2),
                'after_memory_mb': round(after_memory, 2),
                'memory_delta_mb': round(memory_delta, 2),
                'duration_seconds': round(duration, 3),
                'peak_memory_mb': round(self.peak_memory, 2),
                'system_memory': self._get_system_memory(),
                'details': details or {}
            }
            
            self.operation_history.append(card)
            self.operation_memory[operation].append(memory_delta)
            
            # Cleanup old history to prevent unbounded growth
            if len(self.operation_history) > self.MAX_OPERATION_HISTORY:
                self.operation_history = self.operation_history[-self.MAX_OPERATION_HISTORY:]
            
            # Cleanup old operation memory
            if len(self.operation_memory[operation]) > self.MAX_OPERATION_MEMORY:
                self.operation_memory[operation] = self.operation_memory[operation][-self.MAX_OPERATION_MEMORY:]
            
            # Log if significant
            if abs(memory_delta) > 10:  # More than 10MB change
                self._log_card(card)
            
            # Warn if high memory
            if after_memory > self.CRITICAL_THRESHOLD:
                self._log_warning(card, "CRITICAL")
            elif after_memory > self.WARNING_THRESHOLD:
                self._log_warning(card, "WARNING")
    
    def _log_card(self, card: Dict):
        """Log memory tracking record to file"""
        log_file = self.log_dir / f"memory_{datetime.now().strftime('%Y%m%d')}.jsonl"
        try:
            with open(log_file, 'a') as f:
                f.write(json.dumps(card) + '\n')
        except Exception as e:
            print(f"⚠️ Failed to log memory record: {e}")
    
    def _log_warning(self, card: Dict, level: str):
        """Log memory warning"""
        warning_file = self.log_dir / f"warnings_{datetime.now().strftime('%Y%m%d')}.log"
        try:
            with open(warning_file, 'a') as f:
                f.write(f"[{level}] {card['timestamp']} - {card['operation']}: "
                       f"{card['after_memory_mb']}MB (Δ{card['memory_delta_mb']:+}MB)\n")
        except Exception:
            pass
    
    def get_current_reading(self) -> Dict[str, Any]:
        """Get current memory usage statistics and diagnostics"""
        current = self._get_current_memory()
        system = self._get_system_memory()
        uptime = time.time() - self.start_time
        
        # Calculate average memory per operation
        avg_memory_by_op = {}
        for op, deltas in self.operation_memory.items():
            if deltas:
                avg_memory_by_op[op] = {
                    'avg_delta_mb': round(sum(deltas) / len(deltas), 2),
                    'max_delta_mb': round(max(deltas), 2),
                    'count': len(deltas)
                }
        
        return {
            'current_memory_mb': round(current, 2),
            'baseline_memory_mb': round(self.baseline_memory, 2),
            'peak_memory_mb': round(self.peak_memory, 2),
            'memory_growth_mb': round(current - self.baseline_memory, 2),
            'system_memory': system,
            'uptime_seconds': round(uptime, 1),
            'operation_counts': dict(self.operation_counts),
            'average_memory_by_operation': avg_memory_by_op,
            'status': self._get_status(current)
        }
    
    def _get_status(self, current_memory: float) -> str:
        """Get status level based on memory usage"""
        if current_memory > self.EMERGENCY_THRESHOLD:
            return "EMERGENCY - Memory usage critical (>5GB). Immediate action required."
        elif current_memory > self.CRITICAL_THRESHOLD:
            return "CRITICAL - Memory usage high (>2GB). Threshold exceeded."
        elif current_memory > self.WARNING_THRESHOLD:
            return "WARNING - Memory usage elevated (>500MB). Monitor closely."
        else:
            return "NORMAL - Memory usage within acceptable range."
    
    def get_top_memory_operations(self, limit: int = 10) -> List[Dict]:
        """Get operations consuming the most memory"""
        op_totals = {}
        for op, deltas in self.operation_memory.items():
            op_totals[op] = {
                'total_mb': sum(deltas),
                'count': len(deltas),
                'avg_mb': sum(deltas) / len(deltas) if deltas else 0,
                'max_mb': max(deltas) if deltas else 0
            }
        
        sorted_ops = sorted(
            op_totals.items(),
            key=lambda x: x[1]['total_mb'],
            reverse=True
        )
        
        return [
            {
                'operation': op,
                **stats
            }
            for op, stats in sorted_ops[:limit]
        ]
    
    def get_recent_operations(self, limit: int = 20) -> List[Dict]:
        """Get recent memory tracking records"""
        return self.operation_history[-limit:]
    
    def diagnose_leak(self) -> Dict[str, Any]:
        """Diagnose potential memory leaks"""
        if len(self.operation_history) < 10:
            return {'status': 'insufficient_data', 'message': 'Need more operations to diagnose'}
        
        # Check for consistent memory growth
        recent_memory = [card['after_memory_mb'] for card in self.operation_history[-20:]]
        if len(recent_memory) < 5:
            return {'status': 'insufficient_data'}
        
        # Calculate trend
        memory_trend = recent_memory[-1] - recent_memory[0]
        growth_rate = memory_trend / len(recent_memory) if recent_memory else 0
        
        # Check for operations that consistently increase memory
        leak_suspects = []
        for op, deltas in self.operation_memory.items():
            if len(deltas) >= 5:
                positive_deltas = [d for d in deltas if d > 0]
                if len(positive_deltas) / len(deltas) > 0.7:  # 70% of operations increase memory
                    avg_growth = sum(positive_deltas) / len(positive_deltas) if positive_deltas else 0
                    if avg_growth > 5:  # More than 5MB average growth
                        leak_suspects.append({
                            'operation': op,
                            'avg_growth_mb': round(avg_growth, 2),
                            'positive_ratio': round(len(positive_deltas) / len(deltas), 2),
                            'count': len(deltas)
                        })
        
        return {
            'status': 'diagnosed',
            'memory_trend_mb': round(memory_trend, 2),
            'growth_rate_mb_per_op': round(growth_rate, 2),
            'leak_suspects': sorted(leak_suspects, key=lambda x: x['avg_growth_mb'], reverse=True),
            'current_memory_mb': round(self._get_current_memory(), 2),
            'peak_memory_mb': round(self.peak_memory, 2)
        }


# Global memory monitor instance
_memory_monitor: Optional[MemoryMonitor] = None

def get_memory_monitor() -> MemoryMonitor:
    """Get or create global memory monitor"""
    global _memory_monitor
    if _memory_monitor is None:
        _memory_monitor = MemoryMonitor()
    return _memory_monitor

def track_operation(operation: str, details: Optional[Dict] = None):
    """
    Context manager to track memory for an operation
    
    Usage:
        with track_operation("database_query", {"query": "SELECT ..."}):
            # Your code here
            result = db.execute(query)
    """
    monitor = get_memory_monitor()
    before = monitor._get_current_memory()
    start = time.time()
    
    class OperationTracker:
        def __enter__(self):
            return self
        
        def __exit__(self, exc_type, exc_val, exc_tb):
            after = monitor._get_current_memory()
            duration = time.time() - start
            delta = after - before
            
            card = {
                'operation': operation,
                'timestamp': datetime.now().isoformat(),
                'before_memory_mb': round(before, 2),
                'after_memory_mb': round(after, 2),
                'memory_delta_mb': round(delta, 2),
                'duration_seconds': round(duration, 3),
                'error': str(exc_val) if exc_val else None,
                'details': details or {}
            }
            
            monitor.operation_history.append(card)
            monitor.operation_memory[operation].append(delta)
            
            if after > monitor.peak_memory:
                monitor.peak_memory = after
            
            # Log significant changes
            if abs(delta) > 10:
                monitor._log_card(card)
            
            # Warn on high memory
            if after > monitor.CRITICAL_THRESHOLD:
                monitor._log_warning(card, "CRITICAL")
            elif after > monitor.WARNING_THRESHOLD:
                monitor._log_warning(card, "WARNING")
            
            return False  # Don't suppress exceptions
    
    return OperationTracker()


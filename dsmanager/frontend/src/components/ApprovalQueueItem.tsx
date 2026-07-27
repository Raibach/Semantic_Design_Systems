import { motion } from 'motion/react';

export interface ApprovalItem {
  id: string;
  promptName: string;
  version: string;
  submittedBy: string;
  submittedAt: string;
  priority: 'high' | 'medium' | 'low';
  riskLevel: 'high' | 'medium' | 'low';
  category: string;
  estimatedCost: string;
  status: 'pending' | 'in-review' | 'flagged';
  description: string;
}

interface ApprovalQueueItemProps {
  item: ApprovalItem;
  index: number;
  onLoadToComposer: (item: ApprovalItem) => void;
}

export function ApprovalQueueItem({ item, index, onLoadToComposer }: ApprovalQueueItemProps) {
  const priorityColors = {
    high: 'bg-red-50 border-red-300 hover:border-red-500',
    medium: 'bg-yellow-50 border-yellow-300 hover:border-yellow-500',
    low: 'bg-green-50 border-green-300 hover:border-green-500',
  };

  const riskColors = {
    high: 'text-red-600 bg-red-100',
    medium: 'text-yellow-700 bg-yellow-100',
    low: 'text-green-700 bg-green-100',
  };

  const statusColors = {
    pending: 'text-blue-700 bg-blue-100',
    'in-review': 'text-purple-700 bg-purple-100',
    flagged: 'text-orange-700 bg-orange-100',
  };

  return (
    <motion.button
      initial={{ opacity: 0, x: -20, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{
        duration: 0.35,
        delay: 0.1 + (index * 0.05),
        ease: [0.16, 1, 0.3, 1]
      }}
      whileHover={{ 
        scale: 1.01,
        y: -2,
        transition: { duration: 0.2 }
      }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onLoadToComposer(item)}
      className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md ${priorityColors[item.priority]}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-['Inter'] font-bold text-[16px] text-[#1c2f4e]">
              {item.promptName}
            </h3>
            <span className="font-['Inter'] text-[12px] text-[#6c757d] font-medium">
              v{item.version}
            </span>
          </div>
          <p className="font-['Inter'] text-[13px] text-[#495057] leading-relaxed">
            {item.description}
          </p>
        </div>
        
        <div className="flex flex-col gap-2 ml-4">
          <span className={`px-2 py-1 rounded-full text-[10px] font-['Inter'] font-bold uppercase tracking-wide ${statusColors[item.status]}`}>
            {item.status.replace('-', ' ')}
          </span>
          <span className={`px-2 py-1 rounded-full text-[10px] font-['Inter'] font-bold uppercase tracking-wide ${riskColors[item.riskLevel]}`}>
            {item.riskLevel} Risk
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-300">
        <div>
          <div className="text-[10px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-0.5">Submitted By</div>
          <div className="text-[12px] font-['Inter'] font-semibold text-[#1c2f4e]">{item.submittedBy}</div>
        </div>
        <div>
          <div className="text-[10px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-0.5">Time</div>
          <div className="text-[12px] font-['Inter'] font-semibold text-[#1c2f4e]">{item.submittedAt}</div>
        </div>
        <div>
          <div className="text-[10px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-0.5">Category</div>
          <div className="text-[12px] font-['Inter'] font-semibold text-[#1c2f4e]">{item.category}</div>
        </div>
        <div>
          <div className="text-[10px] font-['Inter'] text-[#6c757d] uppercase tracking-wide mb-0.5">Est. Cost</div>
          <div className="text-[12px] font-['Inter'] font-semibold text-[#1c2f4e]">{item.estimatedCost}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <motion.div 
          className="flex items-center gap-1 text-[#507274] font-['Inter'] font-semibold text-[12px]"
          whileHover={{ x: 3 }}
          transition={{ duration: 0.2 }}
        >
          <span>Click to review</span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.div>
      </div>
    </motion.button>
  );
}

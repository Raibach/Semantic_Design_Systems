#!/usr/bin/env python3
"""
Grace AI Evaluation Criteria with Game Theory Scoring

This module defines the 10 core evaluation criteria that Grace AI uses to assess
sources and information. Each criterion includes game theory components that reward
cooperation (clear thinking) and penalize exploitation (deception).

The immune system creates natural alignment: cooperation is literally the winning strategy.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
import json
from datetime import datetime


class MeasurementType(Enum):
    """What aspect of source quality this criterion measures."""
    PROVENANCE = "provenance"           # Where did this come from?
    RELIABILITY = "reliability"         # Can we trust this?
    INDEPENDENCE = "independence"       # Is there bias or conflict?
    ACCURACY = "accuracy"              # Is this correct?
    COMPLETENESS = "completeness"      # Is anything missing?
    TIMELINESS = "timeliness"          # Is this current?
    TRANSPARENCY = "transparency"      # Can we verify this?
    INTEGRITY = "integrity"            # Is this honest?


class CooperationStrategy(Enum):
    """Game theory classification of data behavior."""
    COOPERATIVE = "cooperative"        # Helps clear thinking (+3 points)
    EXPLOITATIVE = "exploitative"      # Deceives or misleads (penalty)
    NEUTRAL = "neutral"                # Neither helps nor harms (0 points)
    UNKNOWN = "unknown"                # Cannot determine (0 points)


@dataclass
class Criterion:
    """
    A single evaluation criterion for assessing sources.

    Each criterion evaluates a specific aspect of source quality and includes
    game theory scoring to reward cooperation and penalize exploitation.
    """

    # Identity
    id: str
    name: str
    description: str

    # Measurement
    measures: List[MeasurementType]
    questions: List[str]  # Questions Grace asks when evaluating

    # Scoring
    weight: float = 1.0  # Relative importance (0.0-2.0)
    cooperation_bonus: int = 3  # Points for cooperative behavior
    exploitation_penalty: int = -5  # Penalty for exploitative behavior

    # Reasoning templates
    cooperative_reasoning: str = ""
    exploitative_reasoning: str = ""
    neutral_reasoning: str = ""

    # Custom scoring function (optional)
    custom_scorer: Optional[Callable[[Dict[str, Any]], float]] = None

    def __post_init__(self):
        """Validate criterion configuration."""
        if not 0.0 <= self.weight <= 2.0:
            raise ValueError(f"Weight must be between 0.0 and 2.0, got {self.weight}")
        if self.cooperation_bonus < 0:
            raise ValueError("Cooperation bonus must be positive")
        if self.exploitation_penalty > 0:
            raise ValueError("Exploitation penalty must be negative")


@dataclass
class EvaluationResult:
    """Result of evaluating a source against a criterion."""

    criterion_id: str
    criterion_name: str

    # Scores
    base_score: float  # 0-100 raw score
    cooperation_strategy: CooperationStrategy
    game_theory_adjustment: int  # +3, 0, or penalty
    final_score: float  # base_score + adjustment

    # Reasoning
    reasoning: str
    evidence: List[str]
    confidence: float  # 0.0-1.0

    # Metadata
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for export."""
        return {
            "criterion_id": self.criterion_id,
            "criterion_name": self.criterion_name,
            "base_score": self.base_score,
            "cooperation_strategy": self.cooperation_strategy.value,
            "game_theory_adjustment": self.game_theory_adjustment,
            "final_score": self.final_score,
            "reasoning": self.reasoning,
            "evidence": self.evidence,
            "confidence": self.confidence,
            "timestamp": self.timestamp
        }


@dataclass
class SourceEvaluation:
    """Complete evaluation of a source across all criteria."""

    source_name: str
    source_url: Optional[str]

    # Results
    criterion_results: List[EvaluationResult]

    # Overall scores
    total_base_score: float = 0.0
    total_game_theory_adjustment: int = 0
    final_score: float = 0.0

    # Statistics
    cooperative_count: int = 0
    exploitative_count: int = 0
    neutral_count: int = 0

    # Overall assessment
    recommendation: str = ""
    confidence: float = 0.0

    # Metadata
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    evaluator_version: str = "1.0.0"

    def calculate_totals(self):
        """Calculate overall scores and statistics."""
        if not self.criterion_results:
            return

        self.total_base_score = sum(r.base_score for r in self.criterion_results) / len(self.criterion_results)
        self.total_game_theory_adjustment = sum(r.game_theory_adjustment for r in self.criterion_results)
        self.final_score = self.total_base_score + self.total_game_theory_adjustment

        # Count strategies
        self.cooperative_count = sum(1 for r in self.criterion_results
                                     if r.cooperation_strategy == CooperationStrategy.COOPERATIVE)
        self.exploitative_count = sum(1 for r in self.criterion_results
                                      if r.cooperation_strategy == CooperationStrategy.EXPLOITATIVE)
        self.neutral_count = sum(1 for r in self.criterion_results
                                if r.cooperation_strategy == CooperationStrategy.NEUTRAL)

        # Calculate confidence
        self.confidence = sum(r.confidence for r in self.criterion_results) / len(self.criterion_results)

        # Generate recommendation
        self.recommendation = self._generate_recommendation()

    def _generate_recommendation(self) -> str:
        """Generate overall recommendation based on scores."""
        if self.final_score >= 90:
            return "HIGHLY TRUSTWORTHY - This source demonstrates strong cooperation with clear thinking."
        elif self.final_score >= 75:
            return "TRUSTWORTHY - This source is generally reliable with good practices."
        elif self.final_score >= 60:
            return "ACCEPTABLE - This source meets basic standards but has some concerns."
        elif self.final_score >= 40:
            return "QUESTIONABLE - This source shows warning signs and should be verified."
        else:
            return "UNRELIABLE - This source exhibits exploitative patterns and should not be trusted."

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for export."""
        return {
            "source_name": self.source_name,
            "source_url": self.source_url,
            "criterion_results": [r.to_dict() for r in self.criterion_results],
            "total_base_score": self.total_base_score,
            "total_game_theory_adjustment": self.total_game_theory_adjustment,
            "final_score": self.final_score,
            "cooperative_count": self.cooperative_count,
            "exploitative_count": self.exploitative_count,
            "neutral_count": self.neutral_count,
            "recommendation": self.recommendation,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
            "evaluator_version": self.evaluator_version
        }

    def to_json(self, indent: int = 2) -> str:
        """Export as JSON string."""
        return json.dumps(self.to_dict(), indent=indent)

    def to_markdown(self) -> str:
        """Export as markdown report."""
        report = f"""# Source Evaluation Report

## Source Information
- **Name:** {self.source_name}
- **URL:** {self.source_url or 'N/A'}
- **Evaluated:** {self.timestamp}
- **Evaluator Version:** {self.evaluator_version}

## Overall Assessment

**Final Score:** {self.final_score:.1f}/100

**Recommendation:** {self.recommendation}

**Confidence:** {self.confidence:.1%}

### Score Breakdown
- Base Score: {self.total_base_score:.1f}
- Game Theory Adjustment: {self.total_game_theory_adjustment:+d}
- **Final Score:** {self.final_score:.1f}

### Cooperation Analysis
- Cooperative Behaviors: {self.cooperative_count}
- Exploitative Behaviors: {self.exploitative_count}
- Neutral Behaviors: {self.neutral_count}

---

## Detailed Evaluation

"""
        for result in self.criterion_results:
            cooperation_emoji = {
                CooperationStrategy.COOPERATIVE: "✓",
                CooperationStrategy.EXPLOITATIVE: "✗",
                CooperationStrategy.NEUTRAL: "○",
                CooperationStrategy.UNKNOWN: "?"
            }[result.cooperation_strategy]

            report += f"""### {cooperation_emoji} {result.criterion_name}

**Score:** {result.final_score:.1f}/100 (Base: {result.base_score:.1f}, Adjustment: {result.game_theory_adjustment:+d})

**Strategy:** {result.cooperation_strategy.value.upper()}

**Reasoning:** {result.reasoning}

**Confidence:** {result.confidence:.1%}

"""
            if result.evidence:
                report += "**Evidence:**\n"
                for evidence in result.evidence:
                    report += f"- {evidence}\n"
                report += "\n"

        return report


class EvaluationCriteria:
    """
    Grace AI's evaluation system with game theory scoring.

    This class manages the 10 core criteria and provides methods to evaluate
    sources, apply game theory scoring, and generate comprehensive reports.
    """

    def __init__(self):
        """Initialize the evaluation system with all 10 criteria."""
        self.criteria: Dict[str, Criterion] = {}
        self._initialize_criteria()

    def _initialize_criteria(self):
        """Define all 10 evaluation criteria."""

        # 1. Attribution / Source Naming
        self.criteria["attribution"] = Criterion(
            id="attribution",
            name="Attribution / Source Naming",
            description="Evaluates whether sources are properly named and attributed",
            measures=[MeasurementType.PROVENANCE, MeasurementType.TRANSPARENCY],
            questions=[
                "Is the original source clearly named?",
                "Are all claims attributed to specific sources?",
                "Can I trace this information back to its origin?",
                "Are quotes properly attributed to speakers?"
            ],
            weight=1.5,  # High importance
            cooperative_reasoning="Source provides clear attribution, enabling verification and accountability. This cooperates with clear thinking.",
            exploitative_reasoning="Source obscures origins or misattributes information, making verification impossible. This exploits trust.",
            neutral_reasoning="Source provides partial attribution but could be clearer."
        )

        # 2. Use of Anonymous Sources
        self.criteria["anonymous_sources"] = Criterion(
            id="anonymous_sources",
            name="Use of Anonymous Sources",
            description="Evaluates the appropriateness and transparency of anonymous sourcing",
            measures=[MeasurementType.TRANSPARENCY, MeasurementType.RELIABILITY],
            questions=[
                "Are anonymous sources clearly labeled as such?",
                "Is there justification for anonymity?",
                "Are there multiple independent sources?",
                "Can the core facts be verified through other means?"
            ],
            weight=1.2,
            cooperative_reasoning="Anonymous sources are used appropriately with clear justification and corroboration. Protects legitimate whistleblowers.",
            exploitative_reasoning="Anonymous sources are used without justification, preventing verification. Enables unfounded claims.",
            neutral_reasoning="Anonymous sources used but verification is limited."
        )

        # 3. Corrections & Error History
        self.criteria["corrections"] = Criterion(
            id="corrections",
            name="Corrections & Error History",
            description="Evaluates how the source handles errors and corrections",
            measures=[MeasurementType.INTEGRITY, MeasurementType.RELIABILITY],
            questions=[
                "Does the source acknowledge and correct errors?",
                "Are corrections clearly labeled and easy to find?",
                "What is the source's historical error rate?",
                "How quickly are errors corrected?"
            ],
            weight=1.3,
            cooperative_reasoning="Source promptly acknowledges and corrects errors, demonstrating integrity and respect for truth.",
            exploitative_reasoning="Source hides errors, makes silent edits, or refuses to issue corrections. Prioritizes image over truth.",
            neutral_reasoning="Source corrects some errors but process could be more transparent."
        )

        # 4. Conflict of Interest / Independence
        self.criteria["independence"] = Criterion(
            id="independence",
            name="Conflict of Interest / Independence",
            description="Evaluates financial and organizational independence",
            measures=[MeasurementType.INDEPENDENCE, MeasurementType.INTEGRITY],
            questions=[
                "Who funds this source?",
                "Are there disclosed conflicts of interest?",
                "Does editorial independence exist?",
                "Are there financial incentives that might bias reporting?"
            ],
            weight=1.4,
            cooperative_reasoning="Source clearly discloses funding and conflicts, maintains editorial independence. Transparent about potential biases.",
            exploitative_reasoning="Source conceals conflicts of interest or allows funders to influence content. Presents sponsored content as journalism.",
            neutral_reasoning="Some conflicts disclosed but independence is unclear."
        )

        # 5. Fairness & Right of Reply
        self.criteria["fairness"] = Criterion(
            id="fairness",
            name="Fairness & Right of Reply",
            description="Evaluates whether subjects have opportunity to respond to allegations",
            measures=[MeasurementType.INTEGRITY, MeasurementType.COMPLETENESS],
            questions=[
                "Were subjects of criticism given opportunity to respond?",
                "Are multiple perspectives presented?",
                "Is there evidence of seeking balance?",
                "Are opposing views fairly represented?"
            ],
            weight=1.2,
            cooperative_reasoning="Source seeks input from all parties, presents multiple perspectives fairly. Enables readers to form own judgments.",
            exploitative_reasoning="Source presents one-sided account, doesn't contact subjects of criticism. Manipulates through omission.",
            neutral_reasoning="Some attempt at balance but could be more comprehensive."
        )

        # 6. Libel / Defamation Safeguards
        self.criteria["libel_safeguards"] = Criterion(
            id="libel_safeguards",
            name="Libel / Defamation Safeguards",
            description="Evaluates protections against false and damaging statements",
            measures=[MeasurementType.ACCURACY, MeasurementType.INTEGRITY],
            questions=[
                "Are claims fact-checked before publication?",
                "Is there editorial review process?",
                "Are potentially defamatory claims properly substantiated?",
                "Is there legal review for sensitive content?"
            ],
            weight=1.3,
            cooperative_reasoning="Source has rigorous fact-checking and legal review. Protects both subjects and readers from false claims.",
            exploitative_reasoning="Source publishes unverified damaging claims without safeguards. Weaponizes information.",
            neutral_reasoning="Some fact-checking exists but process could be stronger."
        )

        # 7. Originality / Plagiarism
        self.criteria["originality"] = Criterion(
            id="originality",
            name="Originality / Plagiarism",
            description="Evaluates whether content is original or properly attributed",
            measures=[MeasurementType.INTEGRITY, MeasurementType.PROVENANCE],
            questions=[
                "Is this original reporting or aggregation?",
                "Are borrowed passages properly quoted and attributed?",
                "Is there evidence of plagiarism?",
                "Does the source add original analysis or just copy others?"
            ],
            weight=1.1,
            cooperative_reasoning="Source provides original reporting or properly attributes borrowed content. Adds value through original analysis.",
            exploitative_reasoning="Source plagiarizes content, presents others' work as own. Violates intellectual property and trust.",
            neutral_reasoning="Mostly aggregated content but some original elements."
        )

        # 8. Context & Full Disclosure
        self.criteria["context"] = Criterion(
            id="context",
            name="Context & Full Disclosure",
            description="Evaluates whether sufficient context is provided to understand information",
            measures=[MeasurementType.COMPLETENESS, MeasurementType.INTEGRITY],
            questions=[
                "Is sufficient background provided?",
                "Are limitations and uncertainties disclosed?",
                "Is context that might change interpretation included?",
                "Are methodologies explained?"
            ],
            weight=1.4,
            cooperative_reasoning="Source provides comprehensive context, discloses limitations. Enables informed interpretation.",
            exploitative_reasoning="Source strips context, cherry-picks facts, omits key information. Manipulates understanding.",
            neutral_reasoning="Some context provided but key details may be missing."
        )

        # 9. Timeliness / Freshness
        self.criteria["timeliness"] = Criterion(
            id="timeliness",
            name="Timeliness / Freshness",
            description="Evaluates whether information is current and updates are noted",
            measures=[MeasurementType.TIMELINESS, MeasurementType.TRANSPARENCY],
            questions=[
                "When was this information published?",
                "Has the situation changed since publication?",
                "Are updates clearly marked?",
                "Is outdated information flagged?"
            ],
            weight=1.0,
            cooperative_reasoning="Information is current, updates are clearly marked. Outdated content is flagged or removed.",
            exploitative_reasoning="Source presents outdated information as current, doesn't update breaking situations. Misleads through staleness.",
            neutral_reasoning="Information is somewhat current but update frequency is unclear."
        )

        # 10. Metadata & Source Transparency
        self.criteria["metadata"] = Criterion(
            id="metadata",
            name="Metadata & Source Transparency",
            description="Evaluates availability of metadata and source documentation",
            measures=[MeasurementType.TRANSPARENCY, MeasurementType.PROVENANCE],
            questions=[
                "Are author credentials provided?",
                "Is publication date clearly visible?",
                "Are source documents linked or available?",
                "Can I see the chain of custody for information?"
            ],
            weight=1.2,
            cooperative_reasoning="Rich metadata provided, sources documented, information lineage clear. Maximum transparency.",
            exploitative_reasoning="Minimal metadata, sources hidden, authorship unclear. Deliberately obscures accountability.",
            neutral_reasoning="Basic metadata present but documentation could be more thorough."
        )

    def get_criterion(self, criterion_id: str) -> Optional[Criterion]:
        """Get a specific criterion by ID."""
        return self.criteria.get(criterion_id)

    def list_criteria(self) -> List[Criterion]:
        """Get all criteria."""
        return list(self.criteria.values())

    def evaluate_criterion(
        self,
        criterion_id: str,
        base_score: float,
        cooperation_strategy: CooperationStrategy,
        evidence: List[str],
        confidence: float = 0.8
    ) -> EvaluationResult:
        """
        Evaluate a source against a single criterion.

        Args:
            criterion_id: ID of criterion to evaluate
            base_score: Raw score 0-100 based on criterion questions
            cooperation_strategy: Whether data cooperates or exploits
            evidence: List of supporting evidence
            confidence: Confidence in evaluation (0.0-1.0)

        Returns:
            EvaluationResult with game theory scoring applied
        """
        criterion = self.criteria.get(criterion_id)
        if not criterion:
            raise ValueError(f"Unknown criterion: {criterion_id}")

        # Apply game theory adjustment
        if cooperation_strategy == CooperationStrategy.COOPERATIVE:
            adjustment = criterion.cooperation_bonus
            reasoning = criterion.cooperative_reasoning
        elif cooperation_strategy == CooperationStrategy.EXPLOITATIVE:
            adjustment = criterion.exploitation_penalty
            reasoning = criterion.exploitative_reasoning
        elif cooperation_strategy == CooperationStrategy.NEUTRAL:
            adjustment = 0
            reasoning = criterion.neutral_reasoning
        else:  # UNKNOWN
            adjustment = 0
            reasoning = "Unable to determine cooperation strategy with available information."

        # Calculate final score (capped at 0-100)
        final_score = max(0, min(100, base_score + adjustment))

        return EvaluationResult(
            criterion_id=criterion.id,
            criterion_name=criterion.name,
            base_score=base_score,
            cooperation_strategy=cooperation_strategy,
            game_theory_adjustment=adjustment,
            final_score=final_score,
            reasoning=reasoning,
            evidence=evidence,
            confidence=confidence
        )

    def evaluate_source(
        self,
        source_name: str,
        evaluations: Dict[str, Dict[str, Any]],
        source_url: Optional[str] = None
    ) -> SourceEvaluation:
        """
        Evaluate a source across all criteria.

        Args:
            source_name: Name of the source being evaluated
            evaluations: Dict mapping criterion_id to evaluation data
                       Format: {
                           "criterion_id": {
                               "base_score": float,
                               "cooperation_strategy": CooperationStrategy,
                               "evidence": List[str],
                               "confidence": float (optional)
                           }
                       }
            source_url: Optional URL of the source

        Returns:
            Complete SourceEvaluation with all scores and recommendations
        """
        results = []

        for criterion_id, eval_data in evaluations.items():
            result = self.evaluate_criterion(
                criterion_id=criterion_id,
                base_score=eval_data["base_score"],
                cooperation_strategy=eval_data["cooperation_strategy"],
                evidence=eval_data.get("evidence", []),
                confidence=eval_data.get("confidence", 0.8)
            )
            results.append(result)

        evaluation = SourceEvaluation(
            source_name=source_name,
            source_url=source_url,
            criterion_results=results
        )

        evaluation.calculate_totals()

        return evaluation

    def export_criteria_definitions(self, format: str = "json") -> str:
        """
        Export all criterion definitions.

        Args:
            format: Export format ("json" or "markdown")

        Returns:
            Formatted string of criterion definitions
        """
        if format == "json":
            criteria_data = []
            for criterion in self.criteria.values():
                criteria_data.append({
                    "id": criterion.id,
                    "name": criterion.name,
                    "description": criterion.description,
                    "measures": [m.value for m in criterion.measures],
                    "questions": criterion.questions,
                    "weight": criterion.weight,
                    "cooperation_bonus": criterion.cooperation_bonus,
                    "exploitation_penalty": criterion.exploitation_penalty,
                    "cooperative_reasoning": criterion.cooperative_reasoning,
                    "exploitative_reasoning": criterion.exploitative_reasoning,
                    "neutral_reasoning": criterion.neutral_reasoning
                })
            return json.dumps(criteria_data, indent=2)

        elif format == "markdown":
            doc = "# Grace AI Evaluation Criteria\n\n"
            doc += "## Overview\n\n"
            doc += "Grace AI uses 10 core criteria to evaluate sources. Each criterion includes game theory scoring:\n\n"
            doc += "- **Cooperative data** (helps clear thinking): +3 points\n"
            doc += "- **Exploitative data** (deceives/misleads): -5 points\n"
            doc += "- **Neutral data**: 0 adjustment\n\n"
            doc += "---\n\n"

            for i, criterion in enumerate(self.criteria.values(), 1):
                doc += f"## {i}. {criterion.name}\n\n"
                doc += f"**ID:** `{criterion.id}`\n\n"
                doc += f"**Description:** {criterion.description}\n\n"
                doc += f"**Weight:** {criterion.weight}x\n\n"
                doc += f"**Measures:** {', '.join(m.value for m in criterion.measures)}\n\n"

                doc += "### Evaluation Questions\n\n"
                for question in criterion.questions:
                    doc += f"- {question}\n"
                doc += "\n"

                doc += "### Game Theory Scoring\n\n"
                doc += f"- **Cooperative (+{criterion.cooperation_bonus}):** {criterion.cooperative_reasoning}\n"
                doc += f"- **Exploitative ({criterion.exploitation_penalty}):** {criterion.exploitative_reasoning}\n"
                doc += f"- **Neutral (0):** {criterion.neutral_reasoning}\n\n"
                doc += "---\n\n"

            return doc

        else:
            raise ValueError(f"Unknown format: {format}")


def main():
    """Example usage of the evaluation system."""
    print("=" * 70)
    print("Grace AI Evaluation Criteria System")
    print("=" * 70)

    # Initialize system
    evaluator = EvaluationCriteria()

    # List all criteria
    print(f"\nLoaded {len(evaluator.list_criteria())} evaluation criteria:\n")
    for i, criterion in enumerate(evaluator.list_criteria(), 1):
        measures_str = ", ".join(m.value for m in criterion.measures)
        print(f"{i}. {criterion.name}")
        print(f"   Measures: {measures_str}")
        print(f"   Weight: {criterion.weight}x")
        print()

    # Example evaluation
    print("=" * 70)
    print("Example: Evaluating a News Source")
    print("=" * 70)

    example_evaluations = {
        "attribution": {
            "base_score": 85,
            "cooperation_strategy": CooperationStrategy.COOPERATIVE,
            "evidence": ["All quotes properly attributed", "Original sources linked"],
            "confidence": 0.9
        },
        "anonymous_sources": {
            "base_score": 70,
            "cooperation_strategy": CooperationStrategy.NEUTRAL,
            "evidence": ["One anonymous source used with justification"],
            "confidence": 0.7
        },
        "corrections": {
            "base_score": 90,
            "cooperation_strategy": CooperationStrategy.COOPERATIVE,
            "evidence": ["Clear corrections policy", "Errors promptly fixed"],
            "confidence": 0.95
        },
        "independence": {
            "base_score": 60,
            "cooperation_strategy": CooperationStrategy.EXPLOITATIVE,
            "evidence": ["Undisclosed corporate sponsorship", "Biased coverage of sponsor"],
            "confidence": 0.85
        },
        "fairness": {
            "base_score": 75,
            "cooperation_strategy": CooperationStrategy.COOPERATIVE,
            "evidence": ["Multiple perspectives included", "Subjects given right of reply"],
            "confidence": 0.8
        }
    }

    evaluation = evaluator.evaluate_source(
        source_name="Example News Outlet",
        evaluations=example_evaluations,
        source_url="https://example.com"
    )

    print(f"\nFinal Score: {evaluation.final_score:.1f}/100")
    print(f"Recommendation: {evaluation.recommendation}")
    print(f"Confidence: {evaluation.confidence:.1%}")
    print(f"\nCooperation Analysis:")
    print(f"  Cooperative: {evaluation.cooperative_count}")
    print(f"  Exploitative: {evaluation.exploitative_count}")
    print(f"  Neutral: {evaluation.neutral_count}")

    # Export report
    print("\n" + "=" * 70)
    print("Generating Markdown Report...")
    print("=" * 70)
    print()
    print(evaluation.to_markdown())


if __name__ == "__main__":
    main()

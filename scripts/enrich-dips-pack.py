#!/usr/bin/env python3
"""Enrich the dips-v1 engram pack with domains and intra-DIP associations.

Adds:
- domain: based on DIP number → domain mapping
- associations: links between engrams from the same DIP section
- version: bumped to 2

Does NOT add:
- dual_coding: impractical for 747 auto-generated engrams
- knowledge_anchors: DIPs are the source, but paths would be local-only

Usage:
    python3 scripts/enrich-dips-pack.py [--dry-run]
"""
import sys
import re
import yaml
from collections import defaultdict

PACK_PATH = "packs/dips-v1/engrams.yaml"

# DIP number → domain mapping
DIP_DOMAINS = {
    "0001": "datacore.contribution",
    "0002": "datacore.context",
    "0003": "datacore.knowledge.scaffolding",
    "0004": "datacore.knowledge.database",
    "0005": "datacore.onboarding",
    "0006": "datacore.questions",
    "0007": "datacore.gtd.inbox",
    "0009": "datacore.gtd",
    "0010": "datacore.sync",
    "0011": "datacore.nightshift",
    "0012": "datacore.crm",
    "0013": "datacore.meetings",
    "0014": "datacore.tags",
    "0015": "datacore.organization",
    "0016": "datacore.registry",
    "0017": "datacore.archive",
    "0018": "datacore.credentials",
    "0019": "datacore.learning",
    "0020": "datacore.modules",
    "0021": "datacore.search",
    "0022": "datacore.engagement",
}


def get_dip_number(engram):
    """Extract DIP number from source_patterns."""
    for sp in engram.get("source_patterns") or []:
        m = re.match(r"DIP-(\d+)", sp)
        if m:
            return m.group(1)
    return None


def get_section(engram):
    """Extract DIP section from source_patterns."""
    for sp in engram.get("source_patterns") or []:
        m = re.match(r"DIP-\d+:\s*(.+)", sp)
        if m:
            return m.group(1).strip()
    return None


def main():
    dry_run = "--dry-run" in sys.argv

    with open(PACK_PATH) as f:
        data = yaml.safe_load(f)

    engrams = data["engrams"]
    all_ids = {e["id"] for e in engrams}

    # Group engrams by DIP and section for association building
    by_dip = defaultdict(list)
    by_section = defaultdict(list)
    for e in engrams:
        dip = get_dip_number(e)
        section = get_section(e)
        if dip:
            by_dip[dip].append(e["id"])
        if dip and section:
            by_section[(dip, section)].append(e["id"])

    stats = {"domains": 0, "associations": 0, "version_bumps": 0}

    for engram in engrams:
        dip = get_dip_number(engram)

        # Add domain
        if dip and dip in DIP_DOMAINS and not engram.get("domain"):
            engram["domain"] = DIP_DOMAINS[dip]
            stats["domains"] += 1

        # Build associations: link to neighbors in same section
        section = get_section(engram)
        if dip and section:
            section_ids = by_section[(dip, section)]
            idx = section_ids.index(engram["id"])
            neighbors = set()
            # Link to adjacent engrams in same section (window of 2)
            for offset in [-2, -1, 1, 2]:
                ni = idx + offset
                if 0 <= ni < len(section_ids):
                    neighbors.add(section_ids[ni])

            if neighbors and not engram.get("associations"):
                engram["associations"] = []
                for target in sorted(neighbors):
                    if target in all_ids:
                        strength = 0.7 if abs(section_ids.index(target) - idx) == 1 else 0.4
                        engram["associations"].append({
                            "target_type": "engram",
                            "target": target,
                            "type": "semantic",
                            "strength": strength,
                        })
                        stats["associations"] += 1

        # Bump version
        if engram.get("version", 1) < 2:
            engram["version"] = 2
            stats["version_bumps"] += 1

    print(f"Engrams: {len(engrams)}")
    print(f"Domains added: {stats['domains']}")
    print(f"Associations added: {stats['associations']}")
    print(f"Version bumps: {stats['version_bumps']}")

    if dry_run:
        print("\n[DRY RUN] No changes written.")
        return

    with open(PACK_PATH, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True, width=120, sort_keys=False)

    print(f"\nWritten to {PACK_PATH}")


if __name__ == "__main__":
    main()

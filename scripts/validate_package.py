from pathlib import Path
import json, sys
root = Path(__file__).resolve().parents[1]
required = [
    'README_START_HERE.md',
    'prompt/CODEX_START_PROMPT_FAST_V3.2.md',
    'docs/PROJECT_BRIEF_FAST.md',
    'docs/ASSET_SPRINT_GUIDE.md',
    'assets/logo/AIPPT_Folded_Signal_Full_Lockup.png',
    'assets/ip/Page_Core_Sage_Scheme_C_Full_Body.png',
    'assets/landing/AIPPT_Approved_Landing_Storyboard.png',
    'assets/workspaces/AIPPT_Six_Core_Workspaces_Approved.png',
]
for rel in required:
    p = root / rel
    if not p.exists() or p.stat().st_size == 0:
        raise SystemExit(f'Missing: {rel}')
json.loads((root/'PACKAGE_MANIFEST.json').read_text(encoding='utf-8'))
print('Package validation OK')

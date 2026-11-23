# Scenario revisions (Word doc only)

These files produce `docs/word/Zombie_Escape_Revised_Scenarios.docx`. They do **not** change the game itself
(`content/scenarios.json` is untouched).

| File | What it is |
|---|---|
| `handwritten.py` | Hand-written additions: flags that pay off later, conditional options, rewritten final gates, 5 new data scenes |
| `minigames_new.py` | The 10 realistic mini games and where each plays in the story |
| `revise.py` | Applies the rule-based changes (trade-offs, traps/gems, weather corrections, weather-adjusted ratings) and writes `revised.json` |
| `build_doc.js` | Builds the Word doc from `revised.json` and `minigames.json` |
| `build_breakdown_doc.js` | Builds `Zombie_Escape_Game_Breakdown.docx` (needs `/tmp/docdata.json`; see the comment at its top) |

Rebuild (needs Python 3.10+ and Node.js with `npm install docx`):

```bash
cd scenario_revisions
python revise.py
python -c "import json, minigames_new as m; json.dump({'rules': m.SHARED_RULES, 'games': m.GAMES, 'placement': m.PLACEMENT}, open('minigames.json','w'), indent=1)"
node build_doc.js
```

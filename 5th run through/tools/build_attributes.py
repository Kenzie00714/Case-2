"""Rebuild content/option_attributes.csv from the scenario text (keeps evidence for each value).
WARNING: overwrites any hand edits. Back up the CSV first if you changed it."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from zombie_sim.attributes import load_content, write_attributes
rows = write_attributes(load_content())
print(f"Wrote {len(rows)} option attribute rows")

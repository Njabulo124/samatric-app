"""
One-off patch: add min_aps_tech_maths to UJ 2027 Part 1 (FADA) courses.
Values from Prospectus 2027 p.32-37. Courses not listed = Tech Maths not accepted (null).
Run once:  python scripts/patch_uj_2027_tech_maths.py
"""
import json
from pathlib import Path

PATH = Path("data/extracted/2027/uj.json")
TECH_MATHS_APS = {
    "BA (Visual Art)": 25,
    "Diploma in Architecture": 26,
    "Diploma in Jewellery Design and Manufacture": 22,
}

doc = json.loads(PATH.read_text(encoding="utf-8"))
for course in doc["courses"]:
    course["min_aps_tech_maths"] = TECH_MATHS_APS.get(course["name"])
PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

found = {c["name"] for c in doc["courses"]} & TECH_MATHS_APS.keys()
missing = TECH_MATHS_APS.keys() - found
print(f"Patched {len(doc['courses'])} courses; Tech Maths APS set on {len(found)}.")
if missing:
    print("WARNING: course names not found:", sorted(missing))

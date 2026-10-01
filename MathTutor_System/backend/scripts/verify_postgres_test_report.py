"""CI must prove PostgreSQL tests ran rather than accepting skipped gates."""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET


def main(path: str) -> None:
    cases = list(ET.parse(Path(path)).getroot().iter("testcase"))
    pg = [case for case in cases if "postgres" in case.get("name", "").lower()
          or "test_user_deletion_postgres" in case.get("classname", "")]
    required = {
        "migration": lambda c: "migration" in c.get("classname", ""),
        "sql_tenant_purge": lambda c: "test_user_tenant_purge" in c.get("classname", ""),
        "cross_store_lifecycle": lambda c: "test_user_deletion_lifecycle" in c.get("classname", ""),
        "upload_delete_race": lambda c: "test_user_deletion_postgres" in c.get("classname", ""),
    }
    for label, select in required.items():
        selected = [case for case in pg if select(case)]
        if not selected or any(list(case) for case in selected):
            raise SystemExit(f"POSTGRES_{label.upper()}: FAIL (missing, skipped, or failed tests)")
        print(f"POSTGRES_{label.upper()}: PASS ({len(selected)} tests, 0 skips)")
    for case in cases:
        skip = case.find("skipped")
        if skip is not None and ("TUTORPRO_TEST_POSTGRES_URL" in str(skip.attrib) + (skip.text or "")
                                 or "NOT_RUN_ENV_UNAVAILABLE" in str(skip.attrib) + (skip.text or "")):
            raise SystemExit("PostgreSQL environment skip is forbidden in CI")
    print(f"POSTGRES_SERVICE_CI: PASS ({len(pg)} PostgreSQL cases)")


if __name__ == "__main__":
    main(sys.argv[1])

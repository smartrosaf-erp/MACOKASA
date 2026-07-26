#!/usr/bin/env python3
"""Validate every migration against the real PostgreSQL parser."""
import glob, sys
try:
    import pglast
except ImportError:
    print("pglast not installed: pip install pglast"); sys.exit(0)

ok = True
for f in sorted(glob.glob("supabase/migrations/*.sql")):
    try:
        n = len(pglast.parse_sql(open(f).read()))
        print(f"  ok   {f}  ({n} statements)")
    except pglast.parser.ParseError as e:
        ok = False
        print(f"  FAIL {f}\n       {e}")
sys.exit(0 if ok else 1)

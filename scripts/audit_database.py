import os
import glob
import re
from collections import defaultdict

MIGRATIONS_DIR = 'supabase/migrations'

def run_audit():
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, '*.sql')))
    print(f"Total migration files: {len(migration_files)}")

    tables_created = {} # table_name -> file_created
    tables_rls_enabled = set()
    policies_by_table = defaultdict(list)
    functions_history = defaultdict(list)
    foreign_keys = []
    indexes_by_table = defaultdict(set)
    table_columns = defaultdict(set)

    for fpath in migration_files:
        fname = os.path.basename(fpath)
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # 1. Tables created & columns
        for m in re.finditer(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\((.*?)\);', content, re.IGNORECASE | re.DOTALL):
            tbl = m.group(1).lower()
            if tbl not in tables_created:
                tables_created[tbl] = fname
            body = m.group(2)
            for line in body.split('\n'):
                line = line.strip()
                if line and not line.startswith('--') and not line.upper().startswith(('CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK')):
                    col_m = re.match(r'([a-zA-Z0-9_]+)', line)
                    if col_m:
                        table_columns[tbl].add(col_m.group(1).lower())

        # Also ADD COLUMN
        for m in re.finditer(r'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)', content, re.IGNORECASE):
            tbl = m.group(1).lower()
            col = m.group(2).lower()
            table_columns[tbl].add(col)

        # 2. Static ALTER TABLE ... ENABLE ROW LEVEL SECURITY
        for m in re.finditer(r'ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY', content, re.IGNORECASE):
            tbl = m.group(1).lower()
            if tbl != '%i':
                tables_rls_enabled.add(tbl)

        # 3. Dynamic DO blocks enabling RLS
        if 'ENABLE ROW LEVEL SECURITY' in content:
            for arr_m in re.finditer(r'ARRAY\s*\[(.*?)\]', content, re.IGNORECASE | re.DOTALL):
                arr_content = arr_m.group(1)
                for tbl_match in re.finditer(r'\'([a-zA-Z0-9_]+)\'', arr_content):
                    t = tbl_match.group(1).lower()
                    tables_rls_enabled.add(t)

        # 4. RLS policies
        for m in re.finditer(r'CREATE\s+POLICY\s+["\']?([^"\'\s]+)["\']?\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)(.*?)(?:;|\Z)', content, re.IGNORECASE | re.DOTALL):
            pol_name = m.group(1)
            tbl = m.group(2).lower()
            pol_body = m.group(3)
            cmd_match = re.search(r'FOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)', pol_body, re.IGNORECASE)
            cmd = cmd_match.group(1).upper() if cmd_match else 'ALL'
            to_match = re.search(r'TO\s+([a-zA-Z0-9_,\s]+)', pol_body, re.IGNORECASE)
            to_roles = to_match.group(1).strip() if to_match else 'PUBLIC'
            policies_by_table[tbl].append({
                'name': pol_name,
                'file': fname,
                'cmd': cmd,
                'to': to_roles,
                'body': pol_body
            })

        # 5. Functions
        func_blocks = re.split(r'(?=CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION)', content, flags=re.IGNORECASE)
        for block in func_blocks:
            if not re.match(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION', block, re.IGNORECASE):
                continue
            h_match = re.search(r'CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_\.]+)\s*(\([^\)]*\))', block, re.IGNORECASE)
            if not h_match:
                continue
            fn_full = h_match.group(1)
            fn_clean = fn_full.lower().replace('public.', '')
            params = h_match.group(2)
            is_secdef = bool(re.search(r'\bSECURITY\s+DEFINER\b', block, re.IGNORECASE))
            sp_match = re.search(r'SET\s+search_path\s*=\s*([^;\n\)]+)', block, re.IGNORECASE)
            sp_val = sp_match.group(1).strip() if sp_match else None
            functions_history[fn_clean].append({
                'full_name': fn_full,
                'params': params,
                'file': fname,
                'secdef': is_secdef,
                'search_path': sp_val,
                'raw': block[:300]
            })

        # 6. Indexes
        for m in re.finditer(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s+USING\s+[a-zA-Z0-9_]+)?\s*\((.*?)\)', content, re.IGNORECASE):
            idx_name = m.group(1)
            tbl = m.group(2).lower()
            raw_cols = m.group(3)
            cols = [re.split(r'\s+', c.strip())[0].lower() for c in raw_cols.split(',')]
            for col in cols:
                indexes_by_table[tbl].add(col)
            if len(cols) > 1:
                indexes_by_table[tbl].add(tuple(cols[:2]))

        # 7. Foreign keys
        for m in re.finditer(r'(?:CONSTRAINT\s+[a-zA-Z0-9_]+\s+)?FOREIGN\s+KEY\s*\(([a-zA-Z0-9_,\s]+)\)\s*REFERENCES\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([a-zA-Z0-9_,\s]+)\)', content, re.IGNORECASE):
            cols = [c.strip().lower() for c in m.group(1).split(',')]
            ref_tbl = m.group(2).lower()
            ref_cols = [c.strip().lower() for c in m.group(3).split(',')]
            pre_text = content[:m.start()]
            tbl_match = re.findall(r'(?:CREATE\s+TABLE|ALTER\s+TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)', pre_text, re.IGNORECASE)
            tbl = tbl_match[-1].lower() if tbl_match else 'unknown'
            foreign_keys.append({
                'table': tbl,
                'column': cols[0],
                'ref_table': ref_tbl,
                'ref_column': ref_cols[0],
                'file': fname
            })

        for m in re.finditer(r'([a-zA-Z0-9_]+)\s+[a-zA-Z0-9_]+(?:\([0-9,\s]+\))?\s+REFERENCES\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([a-zA-Z0-9_]+)\)', content, re.IGNORECASE):
            col = m.group(1).lower()
            ref_tbl = m.group(2).lower()
            ref_col = m.group(3).lower()
            pre_text = content[:m.start()]
            tbl_match = re.findall(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)', pre_text, re.IGNORECASE)
            tbl = tbl_match[-1].lower() if tbl_match else 'unknown'
            foreign_keys.append({
                'table': tbl,
                'column': col,
                'ref_table': ref_tbl,
                'ref_column': ref_col,
                'file': fname
            })

    print(f"\n==========================================")
    print(f"1. RLS COVERAGE AUDIT")
    print(f"==========================================")
    print(f"Total tables detected: {len(tables_created)}")
    print(f"Tables with RLS enabled: {len(tables_rls_enabled.intersection(tables_created.keys()))}")
    missing_rls = sorted(set(tables_created.keys()) - tables_rls_enabled)
    print(f"Tables without RLS: {len(missing_rls)}")
    for t in missing_rls:
        print(f"  - {t}")

    print(f"\n==========================================")
    print(f"2. SECURITY DEFINER SEARCH_PATH AUDIT")
    print(f"==========================================")
    secdef_issues = []
    for fn_name, history in functions_history.items():
        latest = history[-1]
        if latest['secdef']:
            sp = latest['search_path']
            if not sp or sp in ("'public'", "public"):
                secdef_issues.append((fn_name, latest['full_name'], latest['file'], sp))

    print(f"SECURITY DEFINER functions with missing/insecure search_path in latest definition: {len(secdef_issues)}")
    for fn, full, f, sp in secdef_issues:
        print(f"  - {full} in {f} (search_path={sp})")

    print(f"\n==========================================")
    print(f"3. UNINDEXED FOREIGN KEYS & KEY FILTER COLUMNS")
    print(f"==========================================")
    # Filter FKs
    missing_fk_indexes = []
    seen = set()
    for fk in foreign_keys:
        t = fk['table']
        c = fk['column']
        if t in tables_created and c != 'id' and (t, c) not in seen:
            seen.add((t, c))
            if c not in indexes_by_table[t]:
                missing_fk_indexes.append((t, c, fk['ref_table'], fk['file']))

    print(f"Distinct Foreign Key columns missing leading index: {len(missing_fk_indexes)}")
    for t, c, ref, f in missing_fk_indexes[:25]:
        print(f"  - {t}.{c} -> {ref} ({f})")
    if len(missing_fk_indexes) > 25:
        print(f"  ... and {len(missing_fk_indexes) - 25} more")

    # Check frequently filtered columns: organization_id, status, created_at
    filter_cols_missing = []
    for t in sorted(tables_created.keys()):
        cols = table_columns[t]
        for fc in ['organization_id', 'status', 'created_at']:
            if fc in cols and fc not in indexes_by_table[t]:
                # check if composite index starts with fc
                filter_cols_missing.append((t, fc))

    print(f"\nFrequently filtered columns (org_id, status, created_at) without leading index: {len(filter_cols_missing)}")
    for t, fc in filter_cols_missing[:25]:
        print(f"  - {t}.{fc}")
    if len(filter_cols_missing) > 25:
        print(f"  ... and {len(filter_cols_missing) - 25} more")

if __name__ == '__main__':
    run_audit()

#!/usr/bin/env bash
# Usage: JUDGE0_URL=http://127.0.0.1:2358 JUDGE0_AUTH_TOKEN=... ./smoke-test.sh
# Run this BEFORE trusting the judge. It must print PASS for all four cases.
set -u
URL=${JUDGE0_URL:-http://127.0.0.1:2358}
H=(-H "Content-Type: application/json" -H "X-Auth-Token: ${JUDGE0_AUTH_TOKEN:-}")
b64() { printf '%s' "$1" | base64 -w0; }

run() { # name lang src stdin expected want_status_id
  local name=$1 lang=$2 src=$3 stdin=$4 exp=$5 want=$6
  local tok
  tok=$(curl -s "${H[@]}" -X POST "$URL/submissions?base64_encoded=true&wait=false" \
    -d "{\"source_code\":\"$(b64 "$src")\",\"language_id\":$lang,\"stdin\":\"$(b64 "$stdin")\",\"expected_output\":\"$(b64 "$exp")\",\"cpu_time_limit\":1,\"memory_limit\":128000}" |
    sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  [ -z "$tok" ] && { echo "FAIL  $name (no token: auth/URL/limits?)"; return; }
  for _ in $(seq 1 60); do
    r=$(curl -s "${H[@]}" "$URL/submissions/$tok?base64_encoded=true&fields=status")
    id=$(echo "$r" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
    [ "${id:-0}" -ge 3 ] && break
    sleep 1
  done
  [ "${id:-0}" = "$want" ] && echo "PASS  $name (status $id)" || echo "FAIL  $name (got $id, want $want)"
}

run "C++ A+B accepted"      54 '#include <iostream>
int main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\n";}' "2 3" "5
" 3
run "wrong answer detected" 54 '#include <iostream>
int main(){std::cout<<"0\n";}' "2 3" "5
" 4
run "infinite loop -> TLE"  54 'int main(){while(1){}}' "" "" 5
run "compile error -> CE"   54 'int main(){ this is not c++ }' "" "" 6

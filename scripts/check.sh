is_mock_exceeds_size() {
   for row in $(cat "${1}" | jq -r '.output.errors[] | @base64'); do
      _jq() {
      echo ${row} | base64 --decode | jq -r ${1}
      }

      if echo $(_jq '.message') | grep -q 'code size.*exceeds'; then
         if echo $(_jq '.sourceLocation.file') | grep -q 'contracts/mocks'; then
            continue
         fi
      fi
      echo "Compile Warning. Please check and make it warning free."
      exit 1
   done
}


compile_result=`ls ./artifacts/build-info/*.json`
for eachfile in $compile_result
do
   if grep -q "\"type\": \"Warning\"" $eachfile; then
      is_mock_exceeds_size $eachfile
   fi
done

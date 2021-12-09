# Configure to exit script as soon as a command fails.
set -o errexit

# delete the existing artifacts and cache directory.
rm -rf artifacts

rm -rf cache

# Compile everything else.
yarn compile

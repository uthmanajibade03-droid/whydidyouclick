#!/bin/bash
cd "$(dirname "$0")"
source transcript-env/bin/activate
python3 app.py &
sleep 3
open http://localhost:3000
wait

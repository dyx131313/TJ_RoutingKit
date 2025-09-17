#!/usr/bin/env bash
# Quick test script to call route API with sample coords (Shanghai People's Square -> Lujiazui)
curl -s "http://localhost:3000/route?from=31.2335,121.4750&to=31.2400,121.4998" | jq '.'

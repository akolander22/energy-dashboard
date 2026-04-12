#!/bin/bash
# generate_xcel_certs.sh
# Generates TLS certificates for authenticating with the Xcel Itron Gen 5 Riva smart meter.
# Run this once, then register the printed LFDI on xcelenergy.com → Meters & Devices → Add Device.

set -e

CERT_DIR="$(dirname "$0")/../certs"
mkdir -p "$CERT_DIR"

KEY_FILE="$CERT_DIR/xcel.key"
CERT_FILE="$CERT_DIR/xcel.crt"

echo "Generating TLS key and self-signed certificate..."

openssl req -x509 -newkey ec \
  -pkeyopt ec_paramgen_curve:P-256 \
  -keyout "$KEY_FILE" \
  -out "$CERT_FILE" \
  -days 3650 \
  -nodes \
  -subj "/C=US/ST=CO/L=Denver/O=HomeEnergy/CN=energy-dashboard"

echo ""
echo "Certificates written to:"
echo "  Key:  $KEY_FILE"
echo "  Cert: $CERT_FILE"
echo ""

# Extract LFDI — it's the SHA256 fingerprint of the cert, formatted as 40 hex chars
FINGERPRINT=$(openssl x509 -in "$CERT_FILE" -fingerprint -sha256 -noout \
  | sed 's/sha256 Fingerprint=//' \
  | sed 's/SHA256 Fingerprint=//' \
  | tr -d ':' \
  | tr '[:lower:]' '[:upper:]')

# LFDI is the first 40 characters of the fingerprint
LFDI="${FINGERPRINT:0:40}"

echo "=========================================="
echo "YOUR LFDI:"
echo "  $LFDI"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Log into xcelenergy.com"
echo "  2. Go to Meters & Devices → Launchpad"
echo "  3. Click 'Add Device' and paste the LFDI above"
echo "  4. Set XCEL_METER_IP in your .env to your meter's local IP"
echo "     (check your router's DHCP table for hostname 'xcel-meter'"
echo "      or MAC prefix B4:23:30)"
echo ""

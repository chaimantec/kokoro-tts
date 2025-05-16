#!/bin/bash

# Generate self-signed certificates for local HTTPS development
echo "Generating self-signed certificates for local HTTPS development..."

# Create directory for certificates if it doesn't exist
mkdir -p certs

# Generate private key
openssl genrsa -out certs/key.pem 2048

# Generate certificate signing request
openssl req -new -key certs/key.pem -out certs/csr.pem -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Generate self-signed certificate
openssl x509 -req -days 365 -in certs/csr.pem -signkey certs/key.pem -out certs/cert.pem

# Remove certificate signing request (no longer needed)
rm certs/csr.pem

echo "Certificates generated successfully!"
echo "You can now start the API server with: node server.js"

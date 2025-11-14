#!/bin/bash
set -e

echo "🪣 Setting up test S3 bucket with sample data..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect docker compose command (newer versions use 'docker compose', older use 'docker-compose')
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${YELLOW}Error: Neither 'docker compose' nor 'docker-compose' found. Please install Docker.${NC}"
    exit 1
fi

# Start MinIO
echo -e "${BLUE}Starting MinIO server...${NC}"
$DOCKER_COMPOSE -f docker-compose.s3-test.yml up -d

# Wait for MinIO to be ready
echo -e "${BLUE}Waiting for MinIO to be ready...${NC}"
sleep 8

# Create temporary directory for sample files
TEMP_DIR=$(mktemp -d)
echo -e "${BLUE}Creating sample files in ${TEMP_DIR}...${NC}"

# Generate sample text file
cat > "${TEMP_DIR}/readme.txt" << 'EOF'
# Welcome to RowFlow S3 Test Bucket!

This is a test bucket for testing S3 integration in RowFlow.

## Features to Test:
- File browsing and navigation
- Image previews
- Document viewing
- Video playback
- Download functionality
- Upload functionality
- Delete operations

Enjoy testing! 🎉
EOF

# Generate sample JSON file
cat > "${TEMP_DIR}/config.json" << 'EOF'
{
  "application": "RowFlow",
  "version": "1.0.0",
  "features": {
    "s3": true,
    "postgres": true,
    "preview": true
  },
  "supported_formats": [
    "images",
    "videos",
    "documents",
    "code"
  ]
}
EOF

# Generate sample CSV file
cat > "${TEMP_DIR}/sample-data.csv" << 'EOF'
id,name,email,created_at
1,John Doe,john@example.com,2024-01-15
2,Jane Smith,jane@example.com,2024-01-16
3,Bob Johnson,bob@example.com,2024-01-17
4,Alice Williams,alice@example.com,2024-01-18
5,Charlie Brown,charlie@example.com,2024-01-19
EOF

# Generate sample SQL file
cat > "${TEMP_DIR}/schema.sql" << 'EOF'
-- Sample database schema
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample data referencing S3 objects
INSERT INTO products (name, price, image_url) VALUES
    ('Product A', 29.99, 's3://test-bucket/images/sample-image-1.jpg'),
    ('Product B', 49.99, 's3://test-bucket/images/sample-image-2.jpg');
EOF

# Generate sample Python file
cat > "${TEMP_DIR}/example.py" << 'EOF'
#!/usr/bin/env python3
"""
Sample Python script for testing code preview in RowFlow S3 browser.
"""

def greet(name: str) -> str:
    """Return a greeting message."""
    return f"Hello, {name}! Welcome to RowFlow S3 testing."

def main():
    """Main function."""
    users = ["Alice", "Bob", "Charlie"]

    for user in users:
        print(greet(user))

    # Test data structure
    data = {
        "bucket": "test-bucket",
        "files": ["image.jpg", "document.pdf", "video.mp4"],
        "total_size": "150MB"
    }

    print(f"\nBucket info: {data}")

if __name__ == "__main__":
    main()
EOF

# Generate sample JavaScript file
cat > "${TEMP_DIR}/example.js" << 'EOF'
/**
 * Sample JavaScript file for testing code preview
 */

class S3Browser {
  constructor(bucketName) {
    this.bucketName = bucketName;
    this.files = [];
  }

  async listFiles() {
    console.log(`Listing files in bucket: ${this.bucketName}`);
    return this.files;
  }

  async uploadFile(file) {
    console.log(`Uploading file: ${file.name}`);
    this.files.push(file);
    return { success: true, key: file.name };
  }

  async downloadFile(key) {
    const file = this.files.find(f => f.name === key);
    if (file) {
      console.log(`Downloading: ${key}`);
      return file;
    }
    throw new Error('File not found');
  }
}

// Usage example
const browser = new S3Browser('test-bucket');
console.log('S3 Browser initialized!');
EOF

# Generate sample HTML file
cat > "${TEMP_DIR}/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RowFlow S3 Test</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 { color: #333; }
        .feature { margin: 10px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🪣 RowFlow S3 Test Bucket</h1>
        <p>This HTML file is stored in S3 and can be previewed in RowFlow!</p>
        <h2>Features:</h2>
        <div class="feature">✅ File browsing</div>
        <div class="feature">✅ Image preview</div>
        <div class="feature">✅ Video playback</div>
        <div class="feature">✅ Code highlighting</div>
    </div>
</body>
</html>
EOF

# Generate sample Markdown file
cat > "${TEMP_DIR}/guide.md" << 'EOF'
# RowFlow S3 Integration Guide

## Quick Start

1. **Connect to S3**
   - Click "New Connection"
   - Select "S3 Bucket"
   - Enter your credentials

2. **Browse Files**
   - Navigate folders
   - View thumbnails
   - Search files

3. **Preview Content**
   - Click eye icon
   - View images, videos, PDFs
   - Read code with syntax highlighting

## Supported File Types

- **Images**: JPG, PNG, GIF, WebP, SVG
- **Videos**: MP4, WebM, MOV
- **Documents**: PDF, TXT, MD
- **Code**: JS, TS, PY, RS, GO, etc.

---

*Happy testing!* 🎉
EOF

# Generate a simple SVG image
cat > "${TEMP_DIR}/logo.svg" << 'EOF'
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <rect width="200" height="200" fill="#3b82f6" rx="20"/>
  <text x="100" y="120" font-family="Arial" font-size="60" fill="white" text-anchor="middle" font-weight="bold">S3</text>
  <circle cx="50" cy="50" r="20" fill="#60a5fa"/>
  <circle cx="150" cy="50" r="20" fill="#60a5fa"/>
  <circle cx="50" cy="150" r="20" fill="#60a5fa"/>
  <circle cx="150" cy="150" r="20" fill="#60a5fa"/>
</svg>
EOF

# Create a simple colored PNG using ImageMagick (if available) or just skip
if command -v convert &> /dev/null; then
    echo -e "${BLUE}Creating sample images with ImageMagick...${NC}"
    convert -size 800x600 xc:#3b82f6 -pointsize 72 -fill white -gravity center -annotate +0+0 "Sample\nImage 1" "${TEMP_DIR}/sample-image-1.jpg"
    convert -size 800x600 xc:#10b981 -pointsize 72 -fill white -gravity center -annotate +0+0 "Sample\nImage 2" "${TEMP_DIR}/sample-image-2.jpg"
    convert -size 400x300 xc:#f59e0b -pointsize 48 -fill white -gravity center -annotate +0+0 "Thumbnail" "${TEMP_DIR}/thumbnail.png"
else
    echo -e "${YELLOW}ImageMagick not found, skipping sample image generation${NC}"
    echo -e "${YELLOW}You can manually add images to the bucket via MinIO console${NC}"
fi

# Upload files to MinIO using docker exec
echo -e "${BLUE}Uploading sample files to MinIO...${NC}"

# Function to upload file
upload_file() {
    local file=$1
    local dest=$2
    if [ -f "$file" ]; then
        docker exec rowflow-minio-test sh -c "cat > /tmp/upload" < "$file"
        docker exec rowflow-minio-test mc cp /tmp/upload "myminio/test-bucket/${dest}"
        echo -e "${GREEN}✓ Uploaded: ${dest}${NC}"
    fi
}

# Upload text and code files
upload_file "${TEMP_DIR}/readme.txt" "readme.txt"
upload_file "${TEMP_DIR}/config.json" "data/config.json"
upload_file "${TEMP_DIR}/sample-data.csv" "data/sample-data.csv"
upload_file "${TEMP_DIR}/schema.sql" "data/schema.sql"
upload_file "${TEMP_DIR}/example.py" "code/example.py"
upload_file "${TEMP_DIR}/example.js" "code/example.js"
upload_file "${TEMP_DIR}/index.html" "documents/index.html"
upload_file "${TEMP_DIR}/guide.md" "documents/guide.md"
upload_file "${TEMP_DIR}/logo.svg" "images/logo.svg"

# Upload images if they were created
if [ -f "${TEMP_DIR}/sample-image-1.jpg" ]; then
    upload_file "${TEMP_DIR}/sample-image-1.jpg" "images/sample-image-1.jpg"
    upload_file "${TEMP_DIR}/sample-image-2.jpg" "images/sample-image-2.jpg"
    upload_file "${TEMP_DIR}/thumbnail.png" "images/thumbnail.png"
fi

# Cleanup
rm -rf "${TEMP_DIR}"

echo ""
echo -e "${GREEN}✅ Test S3 bucket setup complete!${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}MinIO Connection Details:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  🌐 MinIO Console: http://localhost:9001"
echo "  📡 API Endpoint:  http://localhost:9000"
echo "  🔑 Username:      rowflow"
echo "  🔐 Password:      rowflow123"
echo "  🪣 Bucket Name:   test-bucket"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}RowFlow S3 Connection Settings:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "  Connection Name:      MinIO Test"
echo "  Endpoint:             http://localhost:9000"
echo "  Region:               us-east-1"
echo "  Bucket:               test-bucket"
echo "  Access Key ID:        rowflow"
echo "  Secret Access Key:    rowflow123"
echo "  Force Path-Style:     ✓ (checked)"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Sample Files Created:${NC}"
echo "  📄 readme.txt"
echo "  📊 data/config.json"
echo "  📊 data/sample-data.csv"
echo "  💾 data/schema.sql"
echo "  🐍 code/example.py"
echo "  📜 code/example.js"
echo "  🌐 documents/index.html"
echo "  📝 documents/guide.md"
echo "  🎨 images/logo.svg"
if [ -f "${TEMP_DIR}/sample-image-1.jpg" ]; then
    echo "  🖼️  images/sample-image-1.jpg"
    echo "  🖼️  images/sample-image-2.jpg"
    echo "  🖼️  images/thumbnail.png"
fi
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Open RowFlow"
echo "  2. Click 'New Connection'"
echo "  3. Use the connection settings above"
echo "  4. Click 'Test Connection'"
echo "  5. Save and start browsing!"
echo ""
echo -e "${BLUE}To stop MinIO:${NC}"
echo "  $DOCKER_COMPOSE -f docker-compose.s3-test.yml down"
echo ""
echo -e "${BLUE}To view MinIO logs:${NC}"
echo "  $DOCKER_COMPOSE -f docker-compose.s3-test.yml logs -f"
echo ""

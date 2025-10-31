#!/bin/bash

echo "🧪 Testing RowFlow MCP Server Connection..."
echo "==========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: List all tools
echo "📋 Test 1: Listing all tools..."
echo "Note: MCP server may warn about missing profiles, but should still list tools"
echo ""
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js > /tmp/mcp-test-output.json 2>&1

# Check if we got a JSON response (ignore warnings)
if grep -q '"result"' /tmp/mcp-test-output.json 2>/dev/null; then
    echo -e "${GREEN}✓ MCP Server responded successfully${NC}"

    # Parse and display tools
    TOOLS_COUNT=$(cat /tmp/mcp-test-output.json | grep -o '"name":' | wc -l | tr -d ' ')
    echo "Found $TOOLS_COUNT tools:"

    cat /tmp/mcp-test-output.json | grep -o '"name":"[^"]*"' | sed 's/"name":"/  - /' | sed 's/"$//'

    echo ""
    if [ "$TOOLS_COUNT" -eq "9" ]; then
        echo -e "${GREEN}✓ All 9 expected tools are registered${NC}"
    else
        echo -e "${YELLOW}⚠ Expected 9 tools, found $TOOLS_COUNT${NC}"
    fi
else
    echo -e "${RED}✗ Failed to connect to MCP server${NC}"
    cat /tmp/mcp-test-output.json
    exit 1
fi

echo ""
echo "==========================================="
echo -e "${GREEN}✓ MCP Server connection test passed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Add to Claude Desktop: Update ~/.config/Claude/claude_desktop_config.json"
echo "  2. Or add to Claude Code: claude mcp add rowflow --command node --args $(pwd)/dist/index.js"

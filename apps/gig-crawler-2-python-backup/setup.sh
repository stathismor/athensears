#!/bin/bash

# Setup script for gig-crawler-2

echo "Setting up gig-crawler-2..."

# Check Python version
python_version=$(python3 --version 2>&1 | grep -oP '\d+\.\d+' | head -1)
required_version="3.11"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "Error: Python $required_version or higher is required (found $python_version)"
    exit 1
fi

echo "✓ Python $python_version detected"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment created"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
echo "✓ Dependencies installed"

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "✓ .env file created - please edit with your API keys"
else
    echo "✓ .env file already exists"
fi

echo ""
echo "Setup complete! Next steps:"
echo "1. Edit .env with your API keys"
echo "2. Activate virtual environment: source venv/bin/activate"
echo "3. Run the service: uvicorn src.main:app --reload --port 3001"
echo ""

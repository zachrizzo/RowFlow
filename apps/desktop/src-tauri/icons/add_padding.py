#!/usr/bin/env python3
"""
Add transparent padding to macOS icon for proper rounded corners.
macOS automatically applies rounded corners, but icons need padding.
"""
from PIL import Image
import sys
import os

def add_padding(input_path, output_path, padding_percent=0.15):
    """
    Add transparent padding around an image.
    padding_percent: Percentage of image size to add as padding (default 15%)
    """
    # Open the image
    img = Image.open(input_path)
    
    # Calculate padding size (15% of the larger dimension)
    max_dimension = max(img.size)
    padding = int(max_dimension * padding_percent)
    
    # Calculate new size
    new_width = img.width + (padding * 2)
    new_height = img.height + (padding * 2)
    
    # Create new image with transparency
    new_img = Image.new('RGBA', (new_width, new_height), (0, 0, 0, 0))
    
    # Paste original image in center
    new_img.paste(img, (padding, padding), img if img.mode == 'RGBA' else None)
    
    # Save the result
    new_img.save(output_path, 'PNG', optimize=True)
    print(f"✓ Added {padding_percent*100}% padding: {input_path} -> {output_path}")
    print(f"  Original: {img.size}, New: {new_img.size}")

if __name__ == '__main__':
    input_file = 'Gemini_Generated_Image_x2hc1fx2hc1fx2hc.png'
    output_file = 'icon_with_padding.png'
    
    if os.path.exists(input_file):
        add_padding(input_file, output_file)
    else:
        print(f"Error: {input_file} not found")
        sys.exit(1)


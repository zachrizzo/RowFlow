#!/usr/bin/env python3
"""
Create macOS icon with rounded corners applied to the image itself.
This ensures the icon appears rounded even before macOS applies its mask.
"""
from PIL import Image, ImageDraw
import sys
import os

def add_rounded_corners(input_path, output_path, corner_radius_percent=0.22):
    """
    Add rounded corners to an image.
    corner_radius_percent: Percentage of image size for corner radius (default 22% for macOS look)
    """
    # Open the image
    img = Image.open(input_path).convert('RGBA')
    
    # Calculate corner radius (22% of the smaller dimension for macOS-style rounded corners)
    size = min(img.size)
    radius = int(size * corner_radius_percent)
    
    # Create a mask with rounded corners
    mask = Image.new('L', img.size, 0)
    draw = ImageDraw.Draw(mask)
    
    # Draw a rounded rectangle filled with white (opaque)
    draw.rounded_rectangle(
        [(0, 0), img.size],
        radius=radius,
        fill=255
    )
    
    # Apply the mask to the image
    output = Image.new('RGBA', img.size, (0, 0, 0, 0))
    output.paste(img, (0, 0))
    output.putalpha(mask)
    
    # Save the result
    output.save(output_path, 'PNG', optimize=True)
    print(f"✓ Applied rounded corners (radius: {radius}px): {input_path} -> {output_path}")
    print(f"  Size: {img.size}, Corner radius: {radius}px ({corner_radius_percent*100}%)")

if __name__ == '__main__':
    input_file = 'Gemini_Generated_Image_x2hc1fx2hc1fx2hc.png'
    output_file = 'icon_rounded.png'
    
    if os.path.exists(input_file):
        add_rounded_corners(input_file, output_file)
    else:
        print(f"Error: {input_file} not found")
        sys.exit(1)


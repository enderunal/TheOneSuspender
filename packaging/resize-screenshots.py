#!/usr/bin/env python3
"""
Screenshot Resizer for Chrome Web Store
Resize screenshots to 1280x800 with proper background filling and aspect ratio preservation.
"""

import os
import sys
from PIL import Image, ImageDraw

# Configuration
TARGET_WIDTH = 1280
TARGET_HEIGHT = 800
INPUT_DIR = "../docs/screenshots"
OUTPUT_DIR = "../docs/screenshots/store"

# Screenshots to process
SCREENSHOTS = [
    "options-gold.png",
    "options-gold-dark.png",
    "appearance-gold.png", 
    "appearance-gold-dark.png", 
    "popup-gold.png",
    "popup-gold-dark.png",
    "suspended-gold.png",
    "suspended-gold-dark.png",
    "tools-gold.png",
    "tools-gold-dark.png"
]

# Background colors for different themes
BACKGROUND_COLORS = {
    "dark": "#2d2d2d",
    "light": "#f5f5f5"
}

def get_background_color(filename):
    """Determine background color based on filename"""
    return BACKGROUND_COLORS["dark"] if "-dark" in filename else BACKGROUND_COLORS["light"]

def resize_image(input_path, output_path):
    """Resize image to target dimensions with proper aspect ratio and background filling"""
    try:
        print(f"Processing: {os.path.basename(input_path)}")
        
        # Load the original image
        with Image.open(input_path) as original_image:
            original_width, original_height = original_image.size
            print(f"  Original dimensions: {original_width}x{original_height}")
            
            # Create target canvas with background color
            background_color = get_background_color(os.path.basename(input_path))
            target_image = Image.new('RGB', (TARGET_WIDTH, TARGET_HEIGHT), background_color)
            
            # Calculate scaling factor to fit image within target dimensions
            scale_x = TARGET_WIDTH / original_width
            scale_y = TARGET_HEIGHT / original_height
            scale = min(scale_x, scale_y)  # Use smaller scale to fit within bounds
            
            # Calculate new dimensions
            new_width = int(original_width * scale)
            new_height = int(original_height * scale)
            
            # Resize the original image
            resized_image = original_image.resize((new_width, new_height), Image.LANCZOS)
            
            # Calculate position to center the image
            x = (TARGET_WIDTH - new_width) // 2
            y = (TARGET_HEIGHT - new_height) // 2
            
            print(f"  Scaled dimensions: {new_width}x{new_height}")
            print(f"  Position: ({x}, {y})")
            print(f"  Scale factor: {scale:.3f}")
            print(f"  Background: {background_color}")
            
            # Paste the resized image onto the target canvas
            if resized_image.mode == 'RGBA':
                target_image.paste(resized_image, (x, y), resized_image)
            else:
                target_image.paste(resized_image, (x, y))
            
            # Save the result
            target_image.save(output_path, "PNG", optimize=True)
            print(f"  ✓ Saved: {output_path}\n")
            
    except Exception as error:
        print(f"Error processing {input_path}: {error}")

def process_screenshots():
    """Main function to process all screenshots"""
    print("🖼️  Screenshot Resizer")
    print(f"Target dimensions: {TARGET_WIDTH}x{TARGET_HEIGHT}")
    print(f"Input directory: {INPUT_DIR}")
    print(f"Output directory: {OUTPUT_DIR}")
    print("━" * 50)
    
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f"Output directory ready: {OUTPUT_DIR}")
    
    # Process each screenshot
    processed_count = 0
    for screenshot in SCREENSHOTS:
        input_path = os.path.join(INPUT_DIR, screenshot)
        output_path = os.path.join(OUTPUT_DIR, screenshot)
        
        # Check if input file exists
        if not os.path.exists(input_path):
            print(f"⚠️  File not found: {input_path}")
            continue
        
        resize_image(input_path, output_path)
        processed_count += 1
    
    print(f"🎉 Successfully processed {processed_count} screenshots!")

def check_dependencies():
    """Check if required dependencies are installed"""
    try:
        import PIL
        print(f"✓ PIL/Pillow version: {PIL.__version__}")
        return True
    except ImportError:
        print("❌ PIL/Pillow is not installed.")
        print("Please install it with: pip install Pillow")
        return False

if __name__ == "__main__":
    print("Screenshot Resizer for Chrome Web Store")
    print("=" * 50)
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    # Process screenshots
    process_screenshots() 
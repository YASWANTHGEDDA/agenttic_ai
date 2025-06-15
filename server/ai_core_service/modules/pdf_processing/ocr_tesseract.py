# modules/pdf_processing/ocr_tesseract.py
import pytesseract
from pdf2image import convert_from_path, exceptions as pdf2image_exceptions
import os

def convert_pdf_to_markdown_tesseract(pdf_path, output_md_path, tesseract_cmd_path=None, poppler_path=None):
    """
    Converts a PDF (image-based or text-based) to a Markdown file using Tesseract OCR.
    This version includes more verbose logging inspired by standalone scripts.

    Args:
        pdf_path (str): The file path to the input PDF.
        output_md_path (str): The file path for the output Markdown file.
        tesseract_cmd_path (str, optional): Path to the Tesseract executable. 
                                           Needed if not in system PATH.
        poppler_path (str, optional): Path to the Poppler 'bin' directory.
                                      Needed on Windows if Poppler is not in PATH.

    Returns:
        bool: True if conversion was successful, False otherwise.
    """
    if tesseract_cmd_path:
        pytesseract.pytesseract.tesseract_cmd = tesseract_cmd_path

    if not os.path.exists(pdf_path):
        print(f"Error: The file '{pdf_path}' was not found.")
        return False

    print(f"Starting Tesseract OCR conversion for '{pdf_path}'...")
    print("Step 1: Converting PDF pages to images...")

    try:
        if poppler_path:
            images = convert_from_path(pdf_path, poppler_path=poppler_path)
        else:
            images = convert_from_path(pdf_path)
        print(f"Successfully converted PDF to {len(images)} image(s).")
    except pdf2image_exceptions.PDFInfoNotInstalledError:
        print("Error: Poppler not found. Poppler is required to convert PDF to images.")
        print("Please install Poppler and/or provide the correct `poppler_path`.")
        print("On Linux: sudo apt-get install poppler-utils")
        print("On macOS: brew install poppler")
        print("On Windows: Download Poppler, extract, and add its /bin folder to the system PATH or provide the path.")
        return False
    except pdf2image_exceptions.PDFPageCountError:
        print(f"Error: Could not get page count for PDF '{pdf_path}'. The file might be corrupted, password-protected, or empty.")
        return False
    except Exception as e:
        print(f"An unexpected error occurred while converting PDF to images: {e}")
        return False

    if not images:
        print(f"No images were extracted from '{pdf_path}'. The PDF might be empty or unreadable.")
        return False

    full_markdown_text = ""
    total_pages = len(images)
    
    print(f"Step 2: Found {total_pages} page(s) to process with Tesseract OCR.")

    for i, page_image in enumerate(images):
        page_num = i + 1
        print(f"Processing page {page_num}/{total_pages} with Tesseract...")
        
        try:
            # Use pytesseract.image_to_string to get text from the page image
            text = pytesseract.image_to_string(page_image, lang='eng') # Specify language if needed
            
            full_markdown_text += text
            
            # Add a Markdown horizontal rule between pages for clarity in the final document
            if i < total_pages - 1:
                full_markdown_text += "\n\n---\n\n"
                
        except pytesseract.TesseractNotFoundError:
            print("Tesseract Error: The Tesseract executable was not found.")
            print("Please ensure Tesseract is installed and its path is correctly set via `tesseract_cmd_path` or the system PATH.")
            return False
        except Exception as e:
            print(f"An error occurred during Tesseract OCR on page {page_num}: {e}")
            # Be strict: if one page fails, the whole process fails.
            return False

    print("Step 3: Writing extracted text to the output Markdown file...")
    try:
        # Ensure the output directory exists before writing the file
        output_dir = os.path.dirname(output_md_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            
        with open(output_md_path, "w", encoding="utf-8") as md_file:
            md_file.write(full_markdown_text)
            
        print(f"Successfully converted PDF to Markdown (using Tesseract): '{output_md_path}'")
        return True
    except Exception as e:
        print(f"Error writing Tesseract OCR output to file '{output_md_path}': {e}")
        return False
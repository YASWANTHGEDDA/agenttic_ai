# modules/pdf_processing/ocr_nougat.py
import subprocess
import os
import shutil

def convert_pdf_with_nougat(pdf_path, output_dir, 
                            markdown=True, no_skipping=True, 
                            batchsize=1, full_precision=False, recompute=False,
                            nougat_cli_path="nougat"): # Path to nougat CLI if not in PATH
    """
    Converts a PDF to Markdown using the Nougat OCR CLI.

    Args:
        pdf_path (str): Path to the input PDF file.
        output_dir (str): Directory to save the output .mmd (Markdown) file.
        markdown (bool): Output in markdown format.
        no_skipping (bool): Don't skip pages with no text.
        batchsize (int): Batch size for processing.
        full_precision (bool): Use full precision for the model.
        recompute (bool): Recompute existing extractions.
        nougat_cli_path (str): Command or path to the nougat CLI executable. 

    Returns:
        str: Path to the generated .mmd file if successful, None otherwise.
    """
    if not os.path.exists(pdf_path):
        print(f"Error: PDF file not found at '{pdf_path}'")
        return None

    if not shutil.which(nougat_cli_path) and not os.path.exists(nougat_cli_path):
        print(f"Error: Nougat CLI command '{nougat_cli_path}' not found in PATH or as a direct path.")
        print("Please ensure Nougat is installed and accessible.")
        return None

    os.makedirs(output_dir, exist_ok=True)

    command = [nougat_cli_path]
    command.append(pdf_path)
    command.extend(["--out", output_dir])

    if markdown:
        command.append("--markdown")
    if no_skipping:
        command.append("--no-skipping")
    if recompute:
        command.append("--recompute")
    if full_precision:
        command.append("--full-precision")
    
    command.extend(["--batchsize", str(batchsize)])

    print(f"Running Nougat command: {' '.join(command)}")

    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()

        if process.returncode == 0:
            print("Nougat OCR processing completed successfully.")
            print("Stdout:\n", stdout)
            # Nougat saves the output as <pdf_filename_without_ext>.mmd in the output_dir
            pdf_filename_base = os.path.splitext(os.path.basename(pdf_path))[0]
            output_mmd_path = os.path.join(output_dir, f"{pdf_filename_base}.mmd")
            if os.path.exists(output_mmd_path):
                print(f"Output Markdown file: {output_mmd_path}")
                return output_mmd_path
            else:
                print(f"Error: Nougat completed, but output file '{output_mmd_path}' not found.")
                print("Stderr:\n", stderr) # Print stderr if output not found, might contain clues
                return None
        else:
            print(f"Error during Nougat OCR processing (Return Code: {process.returncode}):")
            print("Stdout:\n", stdout)
            print("Stderr:\n", stderr)
            return None
    except FileNotFoundError:
        print(f"Error: Nougat command '{nougat_cli_path}' not found. Is Nougat installed and in your PATH?")
        return None
    except Exception as e:
        print(f"An unexpected error occurred while running Nougat: {e}")
        return None
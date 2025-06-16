step-1 create .env file in ai_core_service(follow the .env.example file)

step-2 create .env file in server(follow the .env.example file)

Step-3: under the ai_core_service path in terminal use this cmds cmds: .venv\Scripts\Activate pip install -r requirements.txt pip install yt_dlp arxiv duckduckgo_search pdf2image pytesseract scholarly pandas

After Sucessful installation of these requirements you need to redirect into server folder and start the ai_core_service using this Command cmd: python -m ai_core_service.app

Step-4 under the server directory use this cmd to install the dependencies cmd: npm install

Step-5 under the client directory use this cmd to install the dependencies cmd: npm install

I. Overall Goal of the "Tools" Section
The "Tools" section in FusedChat aims to provide users with a suite of specialized utilities that leverage AI or perform specific data processing tasks beyond the core chat functionality. These tools help users with tasks like:
Information Gathering: Academic Search, Web PDF Downloader, YouTube Downloader.
Content Creation/Transformation: Markdown to PowerPoint, Markdown to DOCX.
Data Extraction: OCR (Tesseract/Nougat).
This enhances the capabilities of FusedChat, making it a more versatile platform.
II. Architectural Overview (3-Tier Interaction)
The tools generally follow a 3-tier architecture for their operations:
Frontend (React - client/src/components/):
ToolsView.js: Acts as the main container for the tools section. It displays a sidebar listing all available tools and a content area where the selected tool's UI is rendered. It manages which tool is currently active.
Individual Tool Content Components (e.g., WebPdfDownloaderToolContent.js, MarkdownToPptToolContent.js, etc.): Each tool has its own React component. This component is responsible for:
Displaying a user interface (forms with input fields, buttons).
Collecting user input for that specific tool (e.g., search query, markdown content, PDF file to OCR).
Making an API call (via client/src/services/api.js) to the Node.js backend when the user triggers an action (e.g., clicks "Download PDFs" or "Generate PPT").
Handling loading states and displaying results or errors received from the backend.
client/src/services/api.js: Contains functions that make Axios HTTP requests to the Node.js backend API endpoints. Each tool operation will have a corresponding function here (e.g., downloadWebPdfs, createPresentationFromMarkdown).
Node.js Backend (Express - server/):
server/server.js: The main Express application file. It mounts various routers. Crucially, it mounts the externalAiToolsRoutes:
const externalAiToolsRoutes = require('./routes/externalAiTools');
app.use('/api/external-ai-tools', externalAiToolsRoutes);
Use code with caution.
JavaScript
server/routes/externalAiTools.js: This router acts as a proxy or gateway between the React frontend and the Python AI Core Service. It defines endpoints that the frontend calls (e.g., /api/external-ai-tools/download/web_pdfs). When these endpoints are hit:
It receives the request (e.g., JSON payload, FormData for file uploads, query parameters).
It extracts necessary information, including the x-user-id from request headers (set by api.js on the frontend if a user is logged in).
It then makes an HTTP request (using axios) to the corresponding endpoint on the Python AI Core Service.
It forwards the payload (potentially adding user_id to it for Python's use) and headers.
It waits for the Python service's response.
It then sends Python's response (or an error) back to the React frontend.
For file uploads (like OCR), it uses multer to temporarily store the uploaded file on the Node.js server before streaming it to the Python service in a FormData object.
For file downloads (results from Python), it has a route like /api/external-ai-tools/files/* that proxies download requests to Python's file serving endpoint.
Python AI Core Service (Flask - ai_core_service/):
ai_core_service/config.py: Stores configuration for the Python service, including the DEFAULT_ASSETS_DIR (where tool outputs like downloaded PDFs, generated PPTs, MD files are saved), paths to external CLIs (Tesseract, Poppler, Nougat), and API keys (like CORE API key) if used directly by Python.
ai_core_service/app.py: The main Flask application.
It defines various API endpoints under the /tools/... prefix (e.g., /tools/download/web_pdfs, /tools/create/ppt, /tools/ocr/tesseract). These are the endpoints that the Node.js externalAiTools.js router calls.
_handle_tool_file_operation Helper Function: This is a crucial centralized function in app.py. It standardizes:
Receiving requests for tool operations.
Creating user-specific output directories within config.DEFAULT_ASSETS_DIR (e.g., python_tool_assets/<user_id>/web_pdf_downloads/).
Calling the appropriate core logic function from a dedicated Python module (e.g., calling pdf_downloader.download_relevant_pdfs).
Handling the results from these core logic functions (which are expected to be a list of file paths or a Pandas DataFrame).
If a DataFrame is returned (e.g., from academic search), it saves it as a CSV in the user's tool output directory.
Constructing a JSON response that includes:
status: "success" or "error".
message.
processed_count (number of files/items).
download_links_relative: An array of paths relative to DEFAULT_ASSETS_DIR (e.g., "<user_id>/web_pdf_downloads/myfile.pdf").
files_server_paths (absolute paths on the Python server, mainly for debugging).
File Serving Route (/files/<path:requested_path>): This Flask route serves files directly from the config.DEFAULT_ASSETS_DIR. The Node.js file proxy route calls this Python endpoint to stream files back to the client.
Tool-Specific Python Modules (ai_core_service/modules/...):
modules/web_resources/pdf_downloader.py: Contains the logic for searching the web (e.g., using duckduckgo_search, arxiv) for PDF links and then using requests to download them. It's called by the /tools/download/web_pdfs route in app.py.
modules/web_resources/youtube_dl_core.py: Uses the yt-dlp library to download YouTube videos or audio. Called by /tools/download/youtube.
modules/content_creation/md_to_office.py: Parses markdown input (structured for slides) and uses python-pptx to generate PowerPoint files and python-docx to generate Word documents. Called by /tools/create/ppt and /tools/create/doc.
modules/pdf_processing/ocr_tesseract.py: Takes an uploaded PDF, uses pdf2image (which requires Poppler) to convert pages to images, then uses pytesseract (which requires Tesseract OCR engine) to extract text and save it as a markdown file. Called by /tools/ocr/tesseract.
modules/pdf_processing/ocr_nougat.py: Takes an uploaded PDF and uses the nougat CLI tool (via subprocess) to perform OCR and generate a .mmd (markdown variant) file. Called by /tools/ocr/nougat.
modules/academic_search/combined_search.py, core_api.py, openalex_api.py, scholar_api.py: Handle searching academic databases (OpenAlex, Google Scholar, CORE API), fetching metadata, and potentially downloading PDFs from CORE. Results are usually returned as Pandas DataFrames which app.py then saves as CSVs.
III. Code Working Details - Example Flow: Web PDF Downloader
Frontend (WebPdfDownloaderToolContent.js):
User types "devops principles" into the "Search Query" input and sets "Max Downloads" to 1.
User clicks "Download PDFs".
The handleSubmit function is triggered:
isLoading state is set to true.
It calls downloadWebPdfs("devops principles", 1) from client/src/services/api.js.
Frontend (client/src/services/api.js):
The downloadWebPdfs function makes an Axios POST request:
POST http://localhost:5003/api/external-ai-tools/download/web_pdfs
with a JSON body: { query: "devops principles", max_downloads: 1 }.
The Axios request interceptor automatically adds the x-user-id header.
Node.js Backend (server/routes/externalAiTools.js):
The route router.post('/download/web_pdfs', ...) matches.
It extracts query and max_downloads from req.body.
It extracts user_id from req.headers['x-user-id'].
It calls forwardToPythonService targeting the Python endpoint /tools/download/web_pdfs.
The payload sent to Python will be:
{ query: "devops principles", max_downloads: 1, user_id: "current_user_id_from_header" }.
Python AI Core Service (ai_core_service/app.py):
The Flask route @app.route('/tools/download/web_pdfs', methods=['POST']) matches.
It extracts query, max_downloads, and user_id from the JSON payload sent by Node.js.
It calls the _handle_tool_file_operation helper, passing:
tool_name="WebPDFs"
user_id="current_user_id..."
A lambda function: lambda out_dir, q_arg, md_arg: pdf_downloader.download_relevant_pdfs(base_query=q_arg, output_folder=out_dir, max_total_downloads=md_arg)
output_subdir_name="web_pdf_downloads"
query="devops principles" (becomes q_arg in lambda)
max_downloads=1 (becomes md_arg in lambda)
Inside _handle_tool_file_operation:
It creates the directory: python_tool_assets/current_user_id/web_pdf_downloads/.
It calls the lambda, which in turn executes pdf_downloader.download_relevant_pdfs("devops principles", "python_tool_assets/current_user_id/web_pdf_downloads/", 1).
ai_core_service/modules/web_resources/pdf_downloader.py:
The download_relevant_pdfs function:
Searches DuckDuckGo and arXiv for PDF links related to "devops principles".
(Optionally filters these links with an LLM, currently mocked).
Iterates through relevant links.
For each valid PDF link, it calls download_general_pdf_resource or download_arxiv_pdf_resource.
These functions use requests.get() to download the PDF content and save it to a file within the output_folder (e.g., python_tool_assets/current_user_id/web_pdf_downloads/some_devops_doc.pdf).
download_relevant_pdfs returns a list of full absolute paths to the successfully downloaded PDFs (e.g., ["D:\\agent\\NewBot\\server\\python_tool_assets\\current_user_id\\web_pdf_downloads\\some_devops_doc.pdf"]).
Back in _handle_tool_file_operation (app.py):
It receives the list of full paths.
It converts these absolute paths to paths relative to config.DEFAULT_ASSETS_DIR (e.g., ["current_user_id/web_pdf_downloads/some_devops_doc.pdf"]).
It constructs a JSON response:
{
    "status": "success",
    "message": "Successfully processed 1 file(s) via WebPDFs.",
    "processed_count": 1,
    "download_links_relative": ["current_user_id/web_pdf_downloads/some_devops_doc.pdf"],
    "files_server_paths": ["D:\\...\\some_devops_doc.pdf"]
}
Use code with caution.
Json
This JSON is sent back to the Node.js server with a 200 OK status.
Node.js Backend (server/routes/externalAiTools.js):
The forwardToPythonService function receives the 200 OK and the JSON data from Python.
It forwards this exact JSON data and the 200 OK status back to the React frontend.
Frontend (WebPdfDownloaderToolContent.js):
The handleSubmit function's await downloadWebPdfs(...) call resolves.
response.data now holds the JSON received from Node.js (which originated from Python).
setApiResult(response.data) updates the component's state.
The JSX re-renders:
It checks apiResult.status === 'success'.
It uses apiResult.message and apiResult.processed_count for display.
It maps over apiResult.download_links_relative. For each relPath:
getProxiedFileDownloadUrl(relPath) is called. This function in api.js constructs the full URL that points to the Node.js file proxy endpoint: http://localhost:5003/api/external-ai-tools/files/current_user_id/web_pdf_downloads/some_devops_doc.pdf.
An <a> tag is rendered with this href and the download attribute.
User Clicks Download Link (Frontend):
The browser makes a GET request to http://localhost:5003/api/external-ai-tools/files/current_user_id/web_pdf_downloads/some_devops_doc.pdf.
Node.js Backend (server/routes/externalAiTools.js):
The route router.get('/files/*', ...) matches.
requestedPathFromClient becomes "current_user_id/web_pdf_downloads/some_devops_doc.pdf".
It constructs the Python file URL: http://localhost:5001/files/current_user_id/web_pdf_downloads/some_devops_doc.pdf.
It makes an axios.get() request to this Python URL with responseType: 'stream'.
Python AI Core Service (ai_core_service/app.py):
The Flask route @app.route('/files/<path:requested_path>', ...) matches.
requested_path is "current_user_id/web_pdf_downloads/some_devops_doc.pdf".
It constructs the absolute path on the Python server: D:\agent\NewBot\server\python_tool_assets\current_user_id\web_pdf_downloads\some_devops_doc.pdf.
It uses send_from_directory to stream the file content back to the Node.js server.
Node.js Backend (server/routes/externalAiTools.js):
Receives the file stream from Python.
Pipes this stream (pythonStreamResponse.data.pipe(res)) back to the client's browser.
Browser: Receives the file stream and initiates the download.
This detailed flow applies similarly to other tools, with variations in the specific Python module logic and the payload structure. For instance, OCR involves a file upload from client to Node, then Node to Python, and then Python returning a link to the generated markdown. Markdown-to-Office tools involve sending markdown text and getting back a link to a PPTX or DOCX file.

# ... (previous sections of README) ...

## Tooling Suite Overview

FusedChat includes a variety of integrated tools to enhance user productivity. Each tool has a dedicated user interface accessible from the "Tools" section in the application's sidebar. When a tool is selected, its specific settings and operational controls are displayed in the main content area.

Detailed usage and configuration for each tool can be found in the [Tool Usage and Settings](#tool-usage-and-settings) section below.

**Brief Overview:**

*   **Web PDF Downloader:** Searches the web for PDFs based on a user query and downloads a specified number of relevant documents.
*   **Academic Search:** Queries academic databases (OpenAlex, Google Scholar, CORE API) for research papers and articles. Results are typically presented as a downloadable CSV.
*   **Markdown to PowerPoint:** Converts structured Markdown text into a PowerPoint (.pptx) presentation.
*   **Markdown to DOCX:** Converts structured Markdown text into a Word (.docx) document, allowing selection of which content part (e.g., slide text, author notes) to include.
*   **OCR Tool (Tesseract & Nougat):** Extracts text from uploaded PDF documents. Users can choose between the Tesseract engine or the Nougat model. Output is a downloadable Markdown file.
*   **YouTube Downloader:** Downloads video or audio from a given YouTube URL, with options for quality selection.

*(File downloads from tools are proxied via `GET /api/external-ai-tools/files/*` on Node.js, which in turn calls `GET /files/*` on Python.)*

## Tool Usage and Settings

This section provides details on how to use each tool from the FusedChat interface and what settings are typically available. All tools are accessed by clicking their respective buttons in the "Tools" sidebar.

---

### 1. Web PDF Downloader

*   **Purpose:** To find and download publicly available PDF documents from the internet based on a search query.
*   **Interface Fields:**
    *   **Search Query for PDFs:** Text input where the user enters keywords or a phrase to search for (e.g., "introduction to machine learning", "devops best practices").
    *   **Max Downloads:** A number input to specify the maximum number of PDF files the tool should attempt to download.
    *   **"Download PDFs" Button:** Initiates the search and download process.
*   **Workflow:**
    1.  User enters a search query.
    2.  User specifies the maximum number of PDFs to download.
    3.  User clicks "Download PDFs".
    4.  The system searches various web sources (e.g., DuckDuckGo, arXiv via `pdf_downloader.py` in Python).
    5.  Relevant PDF links are identified and files are downloaded to the server.
*   **Output/Results:**
    *   A loading indicator is shown during processing.
    *   Upon completion, a list of successfully downloaded PDF filenames is displayed.
    *   Each filename is a clickable link that will trigger the download of the PDF to the user's computer (served via the Node.js proxy from the Python service's assets).
    *   Error messages are displayed if the operation fails or no PDFs are found.

---

### 2. Academic Search

*   **Purpose:** To perform targeted searches across academic databases like OpenAlex, Google Scholar, and the CORE API.
*   **Interface Fields (Example - may vary based on specific UI):**
    *   **Search Query:** Text input for academic keywords, paper titles, author names, etc.
    *   **Minimum Year (Optional):** Input to filter results published from a specific year onwards.
    *   **Max Records per Source (Optional):** Inputs to limit results from OpenAlex, Scholar, etc.
    *   **Publication Types (Checkboxes/Dropdown - Optional):** Filters for journals, conference papers, book chapters.
    *   **"Search Academic Databases" Button:** Starts the search process.
*   **Workflow:**
    1.  User enters a query and any desired filters.
    2.  User clicks "Search Academic Databases".
    3.  The system queries the configured academic sources via the Python backend (`combined_search.py`, `core_api.py`, etc.).
    4.  Results are aggregated, deduplicated, and filtered on the Python backend.
*   **Output/Results:**
    *   A loading indicator is shown.
    *   The primary output is usually a **CSV file** containing the metadata of the found publications (title, authors, year, abstract snippet, citation count, source).
    *   A download link for this CSV file is provided.
    *   If the CORE API search is used and "Download PDFs" was an option and selected, direct PDF download links from CORE might also be attempted or listed (this depends on your `core_api.py` implementation).

---

### 3. Markdown to PowerPoint

*   **Purpose:** To quickly generate a PowerPoint (.pptx) presentation from Markdown text formatted with specific slide delimiters and content keys.
*   **Interface Fields:**
    *   **Output Filename (.pptx):** Text input for the desired name of the generated PPTX file (e.g., "MyPresentation.pptx").
    *   **Markdown Content:** A large textarea where the user pastes or types their Markdown. The Markdown should follow a structure like:
        ```markdown
        ### Slide 1: Title of Slide One
        **Slide Text Content:**
        * Bullet point 1
        * Bullet point 2
            * Sub-bullet

        **Image Prompt:** (Optional) Description for an image for this slide
        **Author Notes for Slide 1:** (Optional) Notes for the presenter

        ---
        ### Slide 2: Another Title
        **Slide Text Content:**
        ...
        ```
    *   **"Generate & Download PPTX" Button:** Initiates the conversion.
*   **Workflow:**
    1.  User provides a filename and the structured Markdown content.
    2.  User clicks "Generate & Download PPTX".
    3.  The Markdown is sent to the Python backend.
    4.  `md_to_office.py` parses the Markdown, identifies slides, titles, text content, and notes.
    5.  A new .pptx file is generated using `python-pptx`.
*   **Output/Results:**
    *   A loading indicator is shown.
    *   On success, the generated .pptx file **automatically starts downloading** in the user's browser.
    *   A success message and a fallback manual download link are also typically displayed.
    *   Error messages appear if conversion fails.

---

### 4. Markdown to DOCX

*   **Purpose:** To generate a Word (.docx) document from the same structured Markdown used for presentations, allowing the user to select which part of the slide content to include (e.g., just author notes, or just slide text).
*   **Interface Fields:**
    *   **Output Filename (.docx):** Text input for the DOCX file name.
    *   **Content Key for DOCX:** A dropdown or radio buttons allowing the user to select which part of the Markdown slide structure to extract into the DOCX. Options typically include:
        *   `text_content` (Main slide text)
        *   `author_notes`
        *   `image_prompt`
    *   **Markdown Content:** Textarea for the structured Markdown (same format as for PPT).
    *   **"Generate & Download DOCX" Button:** Initiates the conversion.
*   **Workflow:**
    1.  User provides filename, selects the content key, and enters Markdown.
    2.  User clicks "Generate & Download DOCX".
    3.  Data is sent to Python.
    4.  `md_to_office.py` parses the Markdown and uses `python-docx` to create a .docx file containing only the content specified by the `content_key` for each slide.
*   **Output/Results:**
    *   Loading indicator.
    *   The generated .docx file **automatically starts downloading**.
    *   Success message and fallback manual download link.
    *   Error messages on failure.

---

### 5. OCR Tool (Tesseract & Nougat)

*   **Purpose:** To extract text from PDF documents, especially scanned or image-based ones.
*   **Interface Fields:**
    *   **File Upload:** A file input field to select a PDF document from the user's computer.
    *   **OCR Engine (Dropdown/Radio):** Allows the user to choose between:
        *   **Tesseract:** General-purpose OCR engine.
        *   **Nougat:** OCR model specialized for academic papers and complex layouts (might be slower but more accurate for such documents).
    *   **"Process PDF for OCR" Button:** Starts the OCR process.
*   **Workflow:**
    1.  User uploads a PDF file.
    2.  User selects an OCR engine.
    3.  User clicks "Process PDF for OCR".
    4.  The PDF is uploaded to the Node.js server, then forwarded to the Python backend.
    5.  **Tesseract:** Python's `ocr_tesseract.py` uses `pdf2image` (with Poppler) to convert PDF pages to images, then `pytesseract` to extract text from these images.
    6.  **Nougat:** Python's `ocr_nougat.py` calls the Nougat CLI tool via `subprocess`.
    7.  The extracted text is saved as a Markdown (.md or .mmd for Nougat) file on the server.
*   **Output/Results:**
    *   Loading indicator.
    *   A success message with a **download link for the generated Markdown file**.
    *   Error messages if OCR fails (e.g., Poppler/Tesseract not found, Nougat CLI error, unreadable PDF).
    *   *(For testers: Ensure Tesseract OCR engine, its language packs, Poppler utilities, and Nougat CLI are correctly installed and configured on the Python server environment or their paths are set in `ai_core_service/.env`)*

---

### 6. YouTube Downloader

*   **Purpose:** To download video or audio content from YouTube.
*   **Interface Fields:**
    *   **YouTube Video/Playlist URL:** Text input for the YouTube link.
    *   **Quality/Format:** A dropdown to select the desired download format:
        *   Specific resolutions (e.g., "1080p", "720p" - typically MP4 video + audio).
        *   "Best Available Video+Audio" (typically MP4).
        *   "Audio Only (MP3)".
        *   "Best Audio Only" (downloads best available audio format, might not be MP3).
    *   **"Download Media" Button:** Initiates the download.
*   **Workflow:**
    1.  User enters a YouTube URL and selects a quality profile.
    2.  User clicks "Download Media".
    3.  The request is sent to Python.
    4.  `youtube_dl_core.py` uses the `yt-dlp` library to fetch and download the media according to the selected quality.
    5.  Files are saved on the server.
*   **Output/Results:**
    *   Loading indicator.
    *   A list of successfully downloaded file(s) is displayed.
    *   Each filename is a clickable link to download the media file.
    *   Error messages if `yt-dlp` fails (e.g., video unavailable, format not found, `ffmpeg` missing for audio extraction/merging).
    *   *(For testers: `ffmpeg` is often required by `yt-dlp` for merging separate video/audio streams or converting to MP3. Ensure `ffmpeg` is installed and in the system PATH on the Python server environment.)*

---

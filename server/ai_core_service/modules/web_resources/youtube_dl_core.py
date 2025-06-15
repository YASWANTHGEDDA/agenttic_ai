# modules/web_resources/youtube_dl_core.py
import os
import re
import shutil
import yt_dlp # Ensure 'yt-dlp' is installed

def sanitize_filename_yt(filename):
    """Sanitizes a string to be a valid filename."""
    # Remove most non-alphanumeric characters, replace spaces with underscores
    sanitized = re.sub(r'[^\w\s-]', '', filename).strip()
    return re.sub(r'\s+', '_', sanitized)

def check_ffmpeg_yt():
    """Checks if ffmpeg is available in the system PATH."""
    return shutil.which("ffmpeg") is not None

def is_playlist_yt(url):
    """Detects if a YouTube URL is a playlist."""
    try:
        with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': 'in_playlist'}) as ydl:
            info = ydl.extract_info(url, download=False)
            # 'entries' existing and being non-empty indicates a playlist
            return 'entries' in info and info['entries']
    except yt_dlp.utils.DownloadError as e:
        # Handle cases like "is not a valid URL" or "Unsupported URL"
        print(f"Could not determine if URL is a playlist (may be invalid or unsupported): {e}")
        return False
    except Exception as e:
        print(f"Unexpected error checking playlist status for {url}: {e}")
        return False # Default to not a playlist on other errors

def _yt_progress_hook(d, progress_callback_func=None):
    """Internal progress hook for yt_dlp, with more detailed console logging."""
    if progress_callback_func:
        progress_callback_func(d) # Pass the whole dict for flexibility
    else: # Default console logging if no callback
        if d['status'] == 'downloading':
            filename = d.get('filename', 'Unknown file')
            # Sanitize title from info_dict if available for cleaner display
            title_display = d.get('info_dict', {}).get('title', os.path.basename(filename))
            
            p = d.get('_percent_str', '0.0%').strip()
            speed = d.get('_speed_str', 'N/A').strip()
            eta = d.get('_eta_str', 'N/A').strip()
            total_bytes_str = d.get('_total_bytes_str', d.get('_total_bytes_estimate_str', 'N/A')).strip()
            
            # More detailed progress string inspired by CLI tools
            progress_str = f"[download] {p} of {total_bytes_str} at {speed}, ETA: {eta}"
            print(f"Downloading {title_display[:50]}... {progress_str}")
        elif d['status'] == 'finished':
            filename = d.get('filename', 'Unknown file')
            title_display = d.get('info_dict', {}).get('title', os.path.basename(filename))
            print(f"Finished downloading: {title_display[:50]}")
        elif d['status'] == 'error':
            filename = d.get('filename', 'Unknown file')
            title_display = d.get('info_dict', {}).get('title', os.path.basename(filename))
            print(f"Error downloading: {title_display[:50]}")


def download_youtube_media(url, quality_profile, output_path,
                           is_playlist_override=None, progress_callback_func=None):
    """
    Downloads a YouTube video or playlist.

    Args:
        url (str): The YouTube URL (video or playlist).
        quality_profile (str): Desired quality (e.g., "720p", "1080p", "best", "audio_mp3", "audio_best").
        output_path (str): Directory to save downloaded files.
        is_playlist_override (bool, optional): Manually specify if URL is a playlist.
                                              If None, auto-detects.
        progress_callback_func (function, optional): A function to call with progress updates.
                                                     It will receive the yt_dlp progress dict.

    Returns:
        list: List of paths to successfully downloaded files. Returns empty list on failure.
    """
    os.makedirs(output_path, exist_ok=True)
    
    if not check_ffmpeg_yt() and "audio" in quality_profile.lower():
        print("Warning: FFmpeg not found. Audio extraction or specific format conversion might fail.")
        # Allow to proceed, yt-dlp might still download some formats without ffmpeg.

    is_playlist_actual = is_playlist_override if is_playlist_override is not None else is_playlist_yt(url)
    
    # Define output template
    if is_playlist_actual:
        # For playlists, include playlist index and sanitize title
        outtmpl = os.path.join(output_path, '%(playlist_index)s-%(title)s.%(ext)s')
    else:
        # For single videos, just sanitize title
        outtmpl = os.path.join(output_path, '%(title)s.%(ext)s')

    ydl_opts = {
        'outtmpl': outtmpl,
        'ignoreerrors': True, # Continue on download errors for individual items in a playlist
        'continue': True, # Continue downloads. Do not redownload fragments of completed files.
        'ignore_no_formats_error': True, # Skip if no formats are available for a video
        'noprogress': True if progress_callback_func else False, # Disable default progress if custom cb used
        'quiet': True if progress_callback_func else False, # Disable console output if custom cb used
        'progress_hooks': [lambda d: _yt_progress_hook(d, progress_callback_func)] if progress_callback_func else [_yt_progress_hook],
        'postprocessor_hooks': [], # Can add postprocessor progress hooks if needed
        'noplaylist': not is_playlist_actual, # Process as single video if not a playlist
        'extract_flat': False, # Ensure we get individual video info for playlists
        'sanitize_filename': True # yt-dlp's internal sanitization
    }

    # Quality settings
    if quality_profile == "audio_mp3":
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192', # Bitrate for MP3
            }],
        })
    elif quality_profile == "audio_best":
        ydl_opts.update({
            'format': 'bestaudio/best', # Download best available audio format
        })
    elif quality_profile == "best":
        ydl_opts.update({
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'merge_output_format': 'mp4',
        })
    elif "p" in quality_profile: # e.g., "720p", "1080p"
        height = quality_profile[:-1]
        ydl_opts.update({
            # Prioritize mp4, fallback to best available if specific height mp4 isn't found
            'format': f'bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={height}]+bestaudio/best[height<={height}]/best',
            'merge_output_format': 'mp4',
        })
    else:
        print(f"Warning: Unknown quality profile '{quality_profile}'. Defaulting to 'best'.")
        ydl_opts.update({
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'merge_output_format': 'mp4',
        })

    downloaded_file_paths = []
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"Starting download for URL: {url} with quality: {quality_profile}")
            # The extract_info call with download=True triggers the download
            # and returns metadata about the downloaded item(s).
            meta = ydl.extract_info(url, download=True)

            if meta:
                # The 'entries' key exists for playlists, even if 'noplaylist' is False (it just processes the first video)
                # To get all paths, we check if the original URL was a playlist.
                if is_playlist_actual and 'entries' in meta:
                    for entry in meta['entries']:
                        # On error, entry can be None
                        if entry and entry.get('filepath'):
                            downloaded_file_paths.append(entry['filepath'])
                        elif entry and entry.get('requested_downloads'): # Older yt-dlp
                            for dl_info in entry['requested_downloads']:
                                downloaded_file_paths.append(dl_info['filepath'])
                else: # Single video
                    if meta.get('filepath'):
                        downloaded_file_paths.append(meta['filepath'])
                    elif meta.get('requested_downloads'):
                         for dl_info in meta['requested_downloads']:
                                downloaded_file_paths.append(dl_info['filepath'])

            if downloaded_file_paths:
                 print(f"Download process complete. Files: {downloaded_file_paths}")
            else:
                 # This can happen if ignoreerrors is True and all items failed
                 print(f"Download process finished, but no files seem to have been successfully downloaded for {url}.")
                 if 'LoudNorm' in str(meta) and not check_ffmpeg_yt(): # Common issue
                     print("A 'LoudNorm' related step might have failed due to missing FFmpeg. Audio quality might be affected or post-processing skipped.")

    except yt_dlp.utils.DownloadError as e:
        print(f"A download error occurred with yt-dlp for URL '{url}': {e}")
    except Exception as e:
        print(f"An unexpected error occurred during YouTube download for '{url}': {e}")

    return downloaded_file_paths
#!/bin/bash

# Container Monkey - Documentation Updater
# Fetches markdown files from GitHub and generates static HTML pages

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$SCRIPT_DIR/docs"
REPO_URL="https://raw.githubusercontent.com/omgboohoo/container_monkey/main"

# Create docs directory if it doesn't exist
mkdir -p "$DOCS_DIR"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📚 Updating Container Monkey documentation...${NC}"

# Clean up old HTML files (optional - comment out if you want to keep other files)
echo -e "${BLUE}Cleaning up old documentation files...${NC}"
rm -f "$DOCS_DIR/readme.html"
rm -f "$DOCS_DIR/recovery_story.html"
rm -f "$DOCS_DIR/security_audit_report.html"
rm -f "$DOCS_DIR/release_notes.html"
rm -f "$DOCS_DIR/prd.html"

# Function to fetch and convert markdown to HTML
convert_markdown() {
    local filename=$1
    local title=$2
    local icon=$3
    local output_name=$4
    local github_url="$REPO_URL/$filename"
    local output_file="$DOCS_DIR/$output_name.html"
    
    echo -e "${GREEN}Fetching $filename...${NC}"
    
    # Fetch markdown content
    if ! curl -s -f "$github_url" > /tmp/markdown_content.md; then
        echo "Error: Failed to fetch $filename from GitHub"
        return 1
    fi
    
    # Export variables for Python
    export DOC_TITLE="$title"
    export DOC_ICON="$icon"
    export DOC_OUTPUT_NAME="$output_name"
    export DOC_OUTPUT_FILE="$output_file"
    
    # Convert markdown to HTML using Python
    python3 << PYEOF
import re
import sys
import os

# Get variables from environment
title = os.environ['DOC_TITLE']
icon = os.environ['DOC_ICON']
output_name = os.environ['DOC_OUTPUT_NAME']
output_file = os.environ['DOC_OUTPUT_FILE']

def markdown_to_html(markdown):
    html = markdown
    
    # Code blocks (must be before inline code)
    html = re.sub(r'\`\`\`(\w+)?\n([\s\S]*?)\`\`\`', 
                  lambda m: f'<pre style="background: var(--bg-card); padding: 1rem; border-radius: var(--radius-sm); overflow-x: auto; margin: 1rem 0; border: 1px solid var(--border); font-family: \'Fira Code\', monospace; font-size: 0.875rem;"><code>{m.group(2).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")}</code></pre>', 
                  html)
    
    # Headers
    html = re.sub(r'^#### (.*)$', r'<h4 style="color: var(--text-main); font-size: 1rem; margin-top: 1.25rem; margin-bottom: 0.5rem; font-weight: 600;">\1</h4>', html, flags=re.MULTILINE)
    html = re.sub(r'^### (.*)$', r'<h3 style="color: var(--text-main); font-size: 1.1rem; margin-top: 1.5rem; margin-bottom: 0.75rem; font-weight: 600;">\1</h3>', html, flags=re.MULTILINE)
    html = re.sub(r'^## (.*)$', r'<h2 style="color: var(--text-main); font-size: 1.3rem; margin-top: 2rem; margin-bottom: 1rem; font-weight: 600;">\1</h2>', html, flags=re.MULTILINE)
    html = re.sub(r'^# (.*)$', r'<h1 style="color: var(--text-main); font-size: 1.5rem; margin-top: 2rem; margin-bottom: 1rem; font-weight: 700;">\1</h1>', html, flags=re.MULTILINE)
    
    # Inline code
    html = re.sub(r'\`([^\`]+)\`', r'<code style="background: var(--bg-card); padding: 0.2rem 0.4rem; border-radius: 4px; font-family: \'Fira Code\', monospace; font-size: 0.9em; color: var(--primary); border: 1px solid var(--border);">\1</code>', html)
    
    # Links - special handling for LICENSE links
    def process_link(match):
        link_text = match.group(1)
        link_url = match.group(2)
        # If link text or URL contains LICENSE, use GitHub LICENSE URL
        if 'LICENSE' in link_text.upper() or 'LICENSE' in link_url.upper():
            link_url = 'https://github.com/omgboohoo/container_monkey/blob/main/LICENSE'
        return f'<a href="{link_url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">{link_text}</a>'
    
    html = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', process_link, html)
    
    # Bold
    html = re.sub(r'\*\*([^*]+)\*\*', r'<strong style="color: var(--text-main); font-weight: 600;">\1</strong>', html)
    
    # Italic
    html = re.sub(r'\*([^*]+)\*', r'<em style="font-style: italic;">\1</em>', html)
    
    # Horizontal rules
    html = re.sub(r'^---$', r'<hr style="border: none; border-top: 1px solid var(--border); margin: 2rem 0;">', html, flags=re.MULTILINE)
    
    # Lists
    lines = html.split('\n')
    result = []
    in_list = False
    list_type = ''
    
    for line in lines:
        ul_match = re.match(r'^[\*\-\+]\s+(.+)$', line)
        ol_match = re.match(r'^\d+\.\s+(.+)$', line)
        
        if ul_match:
            if not in_list or list_type != 'ul':
                if in_list:
                    result.append(f'</{list_type}>')
                result.append('<ul style="margin: 1rem 0; margin-left: 1.5rem; list-style-type: disc;">')
                in_list = True
                list_type = 'ul'
            result.append(f'<li style="margin-bottom: 0.5rem;">{ul_match.group(1)}</li>')
        elif ol_match:
            if not in_list or list_type != 'ol':
                if in_list:
                    result.append(f'</{list_type}>')
                result.append('<ol style="margin: 1rem 0; margin-left: 1.5rem;">')
                in_list = True
                list_type = 'ol'
            result.append(f'<li style="margin-bottom: 0.5rem;">{ol_match.group(1)}</li>')
        else:
            if in_list:
                result.append(f'</{list_type}>')
                in_list = False
                list_type = ''
            result.append(line)
    
    if in_list:
        result.append(f'</{list_type}>')
    
    html = '\n'.join(result)
    
    # Convert markdown line breaks (two spaces + newline) to <br> tags
    html = re.sub(r'  \n', '<br>', html)
    
    # Paragraphs - handle both double newlines and single newlines between distinct text blocks
    lines = html.split('\n')
    result = []
    current_para = []
    prev_was_empty = False
    
    def is_metadata_line(line):
        """Check if line looks like a metadata line (contains <strong>...</strong> with colon)"""
        # Pattern: <strong>Label:</strong> value
        return bool(re.search(r'<strong[^>]*>[^<]*:</strong>', line))
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Skip empty lines, but track them
        if not stripped:
            prev_was_empty = True
            # If we have accumulated content and hit an empty line, flush it as a paragraph
            if current_para:
                para_text = ' '.join(current_para)
                # Check if it's already an HTML tag (header, list, etc.)
                if re.match(r'^<[h|u|o|p|d|h|p|r|p|l|/]', para_text) or re.match(r'^<\/[h|u|o|p|d|h|p|r|p|l]', para_text):
                    result.append(para_text)
                else:
                    result.append(f'<p style="margin-bottom: 1rem;">{para_text}</p>')
                current_para = []
            continue
        
        # If line is already an HTML tag (header, list, hr, etc.), flush current para and add tag
        if re.match(r'^<[h|u|o|p|d|h|p|r|p|l|/]', stripped) or re.match(r'^<\/[h|u|o|p|d|h|p|r|p|l]', stripped):
            if current_para:
                para_text = ' '.join(current_para)
                result.append(f'<p style="margin-bottom: 1rem;">{para_text}</p>')
                current_para = []
            result.append(stripped)
            prev_was_empty = False
        else:
            # Check if this is a metadata line and previous line was also metadata
            # If so, flush previous paragraph and start new one
            if current_para and is_metadata_line(stripped) and is_metadata_line(' '.join(current_para)):
                para_text = ' '.join(current_para)
                result.append(f'<p style="margin-bottom: 1rem;">{para_text}</p>')
                current_para = []
            # If previous line was empty or this is start of new content after HTML tag, start new paragraph
            elif prev_was_empty and current_para:
                para_text = ' '.join(current_para)
                result.append(f'<p style="margin-bottom: 1rem;">{para_text}</p>')
                current_para = []
            # Accumulate text lines
            current_para.append(stripped)
            prev_was_empty = False
    
    # Flush any remaining paragraph
    if current_para:
        para_text = ' '.join(current_para)
        if not re.match(r'^<[h|u|o|p|d|h|p|r|p|l|/]', para_text):
            result.append(f'<p style="margin-bottom: 1rem;">{para_text}</p>')
    
    return '\n'.join(result)

# Read markdown file
with open('/tmp/markdown_content.md', 'r', encoding='utf-8') as f:
    markdown = f.read()

# Convert to HTML
content_html = markdown_to_html(markdown)

# Read template
template = '''<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Google tag (gtag.js) - Runs by default unless rejected -->
    <script>
        // Cookie consent management
        function getCookieConsent() {
            return localStorage.getItem('cookieConsent');
        }

        function setCookieConsent(value) {
            localStorage.setItem('cookieConsent', value);
        }

        // Initialize dataLayer and gtag function BEFORE any GA scripts
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }

        function loadGoogleAnalytics() {
            // Load GA script
            const script1 = document.createElement('script');
            script1.async = true;
            script1.src = 'https://www.googletagmanager.com/gtag/js?id=G-57L9X6RCLG';
            document.head.appendChild(script1);

            // Configure GA
            gtag('js', new Date());
            gtag('config', 'G-57L9X6RCLG');
        }

        function disableGoogleAnalytics() {
            // Disable GA tracking by setting consent mode to denied
            gtag('consent', 'update', {
                'analytics_storage': 'denied',
                'ad_storage': 'denied'
            });
        }

        // Load GA by default UNLESS user has explicitly rejected
        const consent = getCookieConsent();
        if (consent !== 'rejected') {
            // User hasn't rejected, so analytics runs
            loadGoogleAnalytics();
        } else {
            // User has rejected, block analytics
            gtag('consent', 'default', {
                'analytics_storage': 'denied',
                'ad_storage': 'denied'
            });
        }
    </script>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>''' + title + ''' - Container Monkey</title>
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://containermonkey.com/docs/''' + output_name + '''.html">
    <link rel="icon"
        href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 256 256%22><path d=%22M 224 80 L 128 32 L 32 80 L 128 128 Z%22 fill=%22%23000000%22 stroke=%22%2338bdf8%22 stroke-width=%2218%22 stroke-linejoin=%22round%22 stroke-linecap=%22round%22/><path d=%22M 32 80 L 32 176 L 128 224 L 128 128 Z%22 fill=%22%2338bdf8%22 stroke=%22%2338bdf8%22 stroke-width=%2218%22 stroke-linejoin=%22round%22 stroke-linecap=%22round%22/><path d=%22M 224 80 L 224 176 L 128 224 L 128 128 Z%22 fill=%22%23000000%22 stroke=%22%2338bdf8%22 stroke-width=%2218%22 stroke-linejoin=%22round%22 stroke-linecap=%22round%22/><path d=%22M 128 128 L 128 224%22 fill=%22none%22 stroke=%22%2338bdf8%22 stroke-width=%2218%22 stroke-linejoin=%22round%22 stroke-linecap=%22round%22/></svg>">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/styles.css">
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
</head>
<body>
    <nav class="navbar">
        <div class="container">
            <a href="../" class="logo">
                <i class="ph-fill ph-cube"></i>
                <span>Container Monkey</span>
            </a>
            <div class="nav-links" id="nav-links">
                <a href="../index.html#features">Features</a>
                <a href="../index.html#install">Install</a>
                <a href="../index.html#tech">Tech</a>
                <div class="nav-dropdown">
                    <a href="#" class="nav-dropdown-toggle" id="docs-toggle">
                        Docs <i class="ph-fill ph-caret-down" style="font-size: 0.75rem; margin-left: 0.25rem;"></i>
                    </a>
                    <div class="nav-dropdown-menu" id="docs-menu">
                        <a href="readme.html" class="nav-dropdown-item">
                            <i class="ph-fill ph-book-open"></i> Readme
                        </a>
                        <a href="recovery_story.html" class="nav-dropdown-item">
                            <i class="ph-fill ph-arrow-counter-clockwise"></i> Recovery Story
                        </a>
                        <a href="security_audit_report.html" class="nav-dropdown-item">
                            <i class="ph-fill ph-shield-check"></i> Security Audit Report
                        </a>
                        <a href="release_notes.html" class="nav-dropdown-item">
                            <i class="ph-fill ph-newspaper"></i> Release Notes
                        </a>
                        <a href="prd.html" class="nav-dropdown-item">
                            <i class="ph-fill ph-clipboard-text"></i> PRD
                        </a>
                    </div>
                </div>
                <a href="https://github.com/omgboohoo/container_monkey" target="_blank" rel="noopener noreferrer" class="btn btn-outline">
                    <i class="ph-fill ph-github-logo"></i> GitHub
                </a>
                <a href="https://ko-fi.com/containermonkey" target="_blank" rel="noopener noreferrer" class="btn btn-outline">
                    <i class="ph-fill ph-coffee"></i> Buy me a Coffee
                </a>
            </div>
        </div>
    </nav>

    <main style="padding-top: calc(var(--header-height) + 2rem); padding-bottom: 4rem;">
        <div class="container" style="max-width: 900px;">
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 2rem; margin-bottom: 2rem; display: flex; justify-content: center; align-items: center; min-height: 120px;">
                <h1 style="font-size: 2rem; margin: 0; display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
                    <i class="ph-fill ''' + icon + '''" style="color: var(--primary);"></i>
                    ''' + title + '''
                </h1>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 2rem;">
                <div style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.8;">
''' + content_html + '''
                </div>
            </div>
        </div>
    </main>

    <footer>
        <div class="container">
            <div class="footer-content">
                <div class="logo">
                    <i class="ph-fill ph-cube"></i>
                    <span>Container Monkey</span>
                </div>
                <div class="footer-links-grid">
                    <div class="footer-link-column">
                        <h4 style="color: var(--text-main); font-size: 0.9rem; margin-bottom: 0.75rem; font-weight: 600;">Documentation</h4>
                        <div class="footer-links">
                            <a href="readme.html">Readme</a>
                            <a href="recovery_story.html">Recovery Story</a>
                            <a href="security_audit_report.html">Security Audit</a>
                            <a href="release_notes.html">Release Notes</a>
                            <a href="prd.html">PRD</a>
                        </div>
                    </div>
                    <div class="footer-link-column">
                        <h4 style="color: var(--text-main); font-size: 0.9rem; margin-bottom: 0.75rem; font-weight: 600;">Legal</h4>
                        <div class="footer-links">
                            <a href="https://github.com/omgboohoo/container_monkey/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">License</a>
                            <a href="../privacy.html">Privacy Policy</a>
                            <a href="#" id="cookie-settings-link">Cookie Settings</a>
                        </div>
                    </div>
                    <div class="footer-link-column">
                        <h4 style="color: var(--text-main); font-size: 0.9rem; margin-bottom: 0.75rem; font-weight: 600;">Links</h4>
                        <div class="footer-links">
                            <a href="https://github.com/omgboohoo/container_monkey" target="_blank" rel="noopener noreferrer">GitHub</a>
                            <a href="https://ko-fi.com/containermonkey" target="_blank" rel="noopener noreferrer">Buy me a Coffee</a>
                        </div>
                    </div>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2025 <a href="mailto:dan@containermonkey.com" style="color: var(--primary);">Dan Bailey</a>. <span class="desktop-text">Released under </span>GPLv3 License.</p>
            </div>
        </div>
    </footer>


    <script>
        // Docs Dropdown (same as main page)
        const docsToggle = document.getElementById('docs-toggle');
        const docsMenu = document.getElementById('docs-menu');
        let docsMenuOpen = false;

        function toggleDocsMenu(e) {
            e.preventDefault();
            docsMenuOpen = !docsMenuOpen;
            if (docsMenuOpen) {
                docsMenu.classList.add('active');
            } else {
                docsMenu.classList.remove('active');
            }
        }

        function closeDocsMenu() {
            docsMenuOpen = false;
            docsMenu.classList.remove('active');
        }

        if (docsToggle) {
            docsToggle.addEventListener('click', toggleDocsMenu);
        }

        // Close dropdown when clicking outside or on a link
        document.addEventListener('click', (e) => {
            if (docsMenuOpen && !docsToggle.contains(e.target) && !docsMenu.contains(e.target)) {
                closeDocsMenu();
            }
            // Close dropdown when clicking on a dropdown link
            if (docsMenuOpen && docsMenu.contains(e.target)) {
                closeDocsMenu();
            }
        });

        // Navbar scroll effect
        const navbar = document.querySelector('.navbar');
        function updateNavbar() {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }
        updateNavbar();
        window.addEventListener('scroll', updateNavbar);



        // Cookie Settings Link (redirects to main page)
        const cookieSettingsLink = document.getElementById('cookie-settings-link');
        if (cookieSettingsLink) {
            cookieSettingsLink.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = '../index.html#cookie-settings-link';
            });
        }

    </script>
</body>
</html>'''

# Write output file
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(template)
PYEOF

echo -e "${GREEN}✓ Created $output_name.html${NC}"
}

# Convert each documentation file
convert_markdown "README.md" "Container Monkey Documentation" "ph-book-open" "readme"
convert_markdown "RECOVERY_STORY.md" "The Recovery Story" "ph-arrow-counter-clockwise" "recovery_story"
convert_markdown "SECURITY_AUDIT_REPORT.md" "Security Audit Report" "ph-shield-check" "security_audit_report"
convert_markdown "RELEASE_NOTES.md" "Release Notes" "ph-newspaper" "release_notes"
convert_markdown "PRD.md" "Product Requirements Document" "ph-clipboard-text" "prd"

# Clean up temp file
rm -f /tmp/markdown_content.md

echo -e "${BLUE}✅ Documentation update complete!${NC}"
echo -e "${GREEN}📁 Files generated in: $DOCS_DIR${NC}"

# Create zip file of website (excluding the shell script)
echo -e "${BLUE}📦 Creating website.zip...${NC}"
cd "$SCRIPT_DIR"
zip -r website.zip . -x "update-docs.sh" -x "*.zip" -x ".git/*" -x ".gitignore" > /dev/null 2>&1 || {
    echo -e "${BLUE}⚠️  Warning: zip command not found. Skipping zip creation.${NC}"
    echo -e "${BLUE}   Install zip with: sudo apt-get install zip (or equivalent)${NC}"
}
if [ -f "website.zip" ]; then
    echo -e "${GREEN}✓ Created website.zip${NC}"
else
    echo -e "${BLUE}⚠️  website.zip was not created.${NC}"
fi


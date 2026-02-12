# Clippy App 📎

A modern, AI-powered desktop version of the classic Clippy assistant, built with Electron. This Clippy is not just a nostalgic throwback; it's a powerful and extensible conversational AI that can be connected to various Large Language Model (LLM) backends like Ollama, Groq, or any OpenAI-compatible API.

## Features 📎

- **Conversational AI**: Engage in natural conversations with Clippy, powered by the LLM of your choice.
- **Minimize to Tray**: Close the main window and Clippy will stay running in the system tray for easy access.
- **Sentiment-Based Animations**: (Optional) Clippy can react to the sentiment of the conversation with a wide range of animations, making interactions more engaging and empathetic.
- **Auto-Updates**: The application can automatically check for and install updates from your GitHub repository.
- **Eliza Mode**: For a retro-computing experience, you can enable Eliza mode, which uses the classic ELIZA chatbot logic to generate responses.
- **Configurable**: Easily configure the API endpoint, model, and other settings through a simple settings page.

## Getting Started

<!-- DOWNLOADS_TABLE_START -->
<!-- DOWNLOADS_TABLE_END -->

## How to Use 🖇️

-   **Start a conversation**: Click on Clippy to open a prompt and type your message.
-   **Tray Menu**: Right-click the tray icon for the following options:
    -   **Show/Hide Clippy**: Toggle the visibility of the Clippy window.
    -   **Settings**: Open the configuration window.
    -   **Check for Updates**: Manually check for new releases.
    -   **Quit**: Exit the application completely.

## Development

Follow these instructions to get a local copy of Clippy Electron up and running.

### Prerequisites

- [Node.js](https://nodejs.org/) (which includes npm)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/NewJerseyStyle/Clippy-App
    cd Clippy-App
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```

### Configuration

Before you can start talking to Clippy, you need to configure it to connect to your preferred LLM.

1.  **Run the application for the first time:**
    ```sh
    npm start
    ```

2.  **Open Settings:**
    Right-click the Clippy tray icon and select "Settings".

3.  **Fill in the details:**
    -   **API Endpoint**: The URL of your LLM API (e.g., `http://localhost:11434/v1/chat/completions` for Ollama).
    -   **API Key**: Your API key (if required by the service).
    -   **Model**: The name of the model you want to use (e.g., `llama2`, `mixtral-8x7b-32768`).
    -   **Enable Animations**: Check this box to allow Clippy to use animations based on the conversation.

4.  **Save your settings.**

### Building for Distribution

You can build the application into a distributable installer for Windows, macOS, or Linux.

1.  **Run the distribution script:**
    ```sh
    npm run dist
    ```
    This will create the installer in the `dist` directory.

2.  **Auto-Update Configuration**:
    For the auto-update feature to work, you need to:
    -   Fill in the `owner` and `repo` fields in the `build` section of your `package.json` file.
    -   Create a release on GitHub and upload the installer files.

## Technologies Used

- [clippyjs](https://github.com/NewJerseyStyle/clippyjs)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Electron](https://www.electronjs.org/)
- [Electron Builder](https://www.electron.build/)
- [Electron Updater](https://www.electron.build/auto-update)
- [Electron Store](https://github.com/sindresorhus/electron-store)
- [Axios](https://axios-http.com/)

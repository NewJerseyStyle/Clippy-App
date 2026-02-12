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

import { workspace, ExtensionContext, tasks } from "vscode";
import {
  Executable,
  ServerOptions,
  LanguageClientOptions,
  LanguageClient,
  Disposable,
} from "vscode-languageclient";
import { SwiftPMTaskProvider } from "./tasks";

let client: LanguageClient;
let disposable: Disposable | undefined;

export function activate(context: ExtensionContext) {
  const config = workspace.getConfiguration("sourcekit-lsp");

  const executable: Executable = {
    command: config.get<string>("serverPath", "sourcekit-lsp"),
    args: [],
  };

  const toolchain = config.get<string>("toolchainPath", "");
  if (toolchain) {
    executable.options = {
      env: { ...process.env, SOURCEKIT_TOOLCHAIN_PATH: toolchain },
    };
  }

  const serverOptions: ServerOptions = executable;

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    documentSelector: ["swift", "cpp", "c", "objective-c", "objective-cpp"],
    synchronize: {
      // Notify the server about file changes to '.clientrc files contained in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/*.swift"),
    },
  };

  // Create the language client.
  client = new LanguageClient(
    "sourcekit-lsp",
    "SourceKit Language Server",
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.start();

  let workspaceRoot = workspace.rootPath;
  if (workspaceRoot) {
    let provider = new SwiftPMTaskProvider(workspaceRoot);
    disposable = tasks.registerTaskProvider(
      SwiftPMTaskProvider.taskType,
      provider
    );
  }

  console.log("SourceKit-LSP is now active!");
}

// this method is called when your extension is deactivated
export function deactivate(): Thenable<void> | undefined {
  if (disposable) {
    disposable.dispose();
  }
  if (!client) {
    return undefined;
  }
  return client.stop();
}

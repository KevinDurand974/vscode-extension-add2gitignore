import { open, stat, writeFile } from "fs/promises";
import { parse } from "path";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
	const command = vscode.commands.registerCommand("add2gitignore.add", async (arg: vscode.Uri) => {
		try {
			const workspace = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
			if (!workspace) {
				throw new Error("There is no workspace at this moment!");
			}
			const workspaceUri = vscode.workspace.getWorkspaceFolder(workspace.uri)!.uri.path.substring(1);
			const possibleGitIgnorePath = `${workspaceUri}/.gitignore`;

			let activePath = "";
			let activePathDir = false;

			// NOTE - Check if there a .gitignore file
			try {
				await stat(possibleGitIgnorePath);
			} catch (err) {
				throw new Error(".gitignore doesn't exist in your current workspace!");
			}

			if (!arg && vscode.window.activeTextEditor) {
				const currFilePath = vscode.window.activeTextEditor.document.uri.path.substring(1);
				const [, resPath] = currFilePath.match(RegExp(`${workspaceUri}(.*)`))!;
				const fileStat = await stat(currFilePath);
				const isFile = fileStat.isFile();

				activePathDir = !isFile;
				activePath = isFile ? resPath.substring(1) : resPath;
			} else if (arg) {
				const uri = arg.path.substring(1);
				const [, resPath] = uri.match(RegExp(`${workspaceUri}(.*)`))!;
				const fileStat = await stat(uri);
				const isFile = fileStat.isFile();

				activePathDir = !isFile;
				activePath = isFile ? resPath.substring(1) : resPath;
			} else {
				throw new Error("Cannot continue operation!");
			}

			const parsedPath = parse(activePath);
			const activePathDirs = parsedPath.dir.split("/").filter(Boolean);

			if (/[\w]+/.test(parsedPath.dir) && !activePath.startsWith("/")) {
				activePath = `/${activePath}`;
			}

			let content = "";
			let baseText = "";
			const fileData = await open(possibleGitIgnorePath, "r");

			const extensionNameStart = "# [added-by-extension]";
			const extensionNameEnd = "# [/added-by-extension]";

			try {
				baseText = await fileData.readFile({ encoding: "utf-8" });

				if (baseText.includes(activePath) && !activePathDir) {
					throw new Error("Error, this path is already ignored!");
				}

				// NOTE - Stop user from adding path who's already ignored
				let containIgnoredFolder = false;
				activePathDirs.forEach((_, index) => {
					const path = `/${activePathDirs.slice(0, activePathDirs.length - index).join("/")}`;

					if (baseText.split("\n").some((line) => line === path)) {
						containIgnoredFolder = true;
					}
				});
				if (containIgnoredFolder) {
					throw new Error("Error, this path is already ignored!");
				}

				// NOTE - Comment current path who including the newly folder path
				if (baseText.includes(activePath) && activePathDir) {
					const lines = baseText.split("\n");
					const startIndex = lines.findIndex((line) => line.includes(extensionNameStart)) + 1;
					const endIndex = lines.findIndex((line) => line.includes(extensionNameEnd));
					const fileStart = lines.slice(0, startIndex);
					const fileEnd = lines.slice(endIndex - 1, lines.length);
					const extContent = lines.slice(startIndex, endIndex - 1).map((line) => {
						if (line && line.startsWith(activePath)) {
							return `# ${line} # [folder-ignored]`;
						}
						return line;
					});

					baseText = [...fileStart, ...extContent, ...fileEnd].join("\n");
				}

				// NOTE - If contain this extension section
				if (baseText.includes(extensionNameStart) && baseText.includes(extensionNameEnd)) {
					const lines = baseText.split("\n");

					const insertIndex = lines.findIndex((line) => line.includes(extensionNameEnd)) - 1;

					// add new entry
					lines.splice(insertIndex, 0, activePath);

					const startIndex = lines.findIndex((line) => line.includes(extensionNameStart)) + 1;
					const endIndex = lines.findIndex((line) => line.includes(extensionNameEnd));

					const fileStart = lines.slice(0, startIndex);
					const fileEnd = lines.slice(endIndex - 1, lines.length);
					const extContent = lines.slice(startIndex, endIndex - 1);

					const sortedContent = extContent
						.sort((a, b) => {
							if (a > b) {
								return 1;
							}
							if (a < b) {
								return -1;
							}
							return 0;
						})
						.sort((a) => {
							if (a.startsWith(".")) {
								return -1;
							}
							return 1;
						})
						.sort((a) => {
							if (a.startsWith("/")) {
								return -1;
							}
							return 1;
						})
						.sort((a) => {
							if (a.startsWith("#")) {
								return -1;
							}
							return 1;
						});

					content = [...fileStart, ...sortedContent, ...fileEnd].join("\n");
				}
				// NOTE - Fresh gitignore with extension section
				else {
					const lines = baseText.split("\n");
					const lastLine = lines[lines.length - 1];

					if (lastLine !== "") {
						lines.push("");
					}

					lines.push(extensionNameStart, activePath, "", extensionNameEnd, "");

					content += lines.join("\n");
				}

				await writeFile(possibleGitIgnorePath, content, { encoding: "utf-8", flag: "r+" });

				vscode.window.showInformationMessage(".gitignore updated!");
			} catch (err) {
				throw err;
			} finally {
				if (fileData) {
					await fileData.close();
				}
			}
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
		}
	});

	context.subscriptions.push(command);
}

// This method is called when your extension is deactivated
export function deactivate() {}

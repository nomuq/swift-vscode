import * as path from "path";
import * as child_process from "child_process";
import * as fs from "fs";

import {
  TaskProvider,
  Task,
  workspace,
  ShellExecution,
  OutputChannel,
  window,
  TaskGroup,
} from "vscode";
import {
  SwiftPMTaskDefinition,
  SwiftPackageDescription,
  TargetType,
  SwiftPMTarget,
} from "./interfaces";


export class SwiftPMTaskProvider implements TaskProvider {
  static taskType: string = "swift-package";
  private swiftpmPromise: Thenable<Task[]> | undefined = undefined;

  private _channel?: OutputChannel;

  constructor(workspaceRoot: string) {
    let pattern = path.join(workspaceRoot, "Package.swift");
    let fileWatcher = workspace.createFileSystemWatcher(pattern);

    fileWatcher.onDidChange(() => (this.swiftpmPromise = undefined));
    fileWatcher.onDidCreate(() => (this.swiftpmPromise = undefined));
    fileWatcher.onDidDelete(() => (this.swiftpmPromise = undefined));
  }

  public provideTasks(): Thenable<Task[]> | undefined {
    if (!this.swiftpmPromise) {
      this.swiftpmPromise = this.getSwiftPMTasks();
    }
    return this.swiftpmPromise;
  }

  public resolveTask(_task: Task): Task | undefined {
    const task = _task.definition.task;
    // A Swift task consists of a task and an optional file as specified in SwiftTaskDefinition
    // Make sure that this looks like a SwiftPM task by checking that there is a task.
    if (task) {
      const definition: SwiftPMTaskDefinition = <any>_task.definition;
      return new Task(
        definition,
        definition.task,
        "swift",
        new ShellExecution(`swift ${definition.task}`)
      );
    }
    return undefined;
  }

  // Helper Methods

  getOutputChannel(): OutputChannel {
    if (!this._channel) {
      this._channel = window.createOutputChannel("SwiftPM Task Auto Detection");
    }
    return this._channel;
  }

  async getSwiftPMTasks(): Promise<Task[]> {
    let workspaceRoot = workspace.rootPath;
    let result: Task[] = [];
    if (!workspaceRoot) {
      return result;
    }

    let packageFile = path.join(workspaceRoot, "Package.swift");
    if (!(await this.exists(packageFile))) {
      return result;
    }

    let describePackage = "swift package describe --type json";
    try {
      let { stdout, stderr } = await this.exec(describePackage, {
        cwd: workspaceRoot,
      });

      if (stderr && stderr.length > 0) {
        this.getOutputChannel().appendLine(stderr);
        this.getOutputChannel().show(true);
      }

      let result: Task[] = [];
      if (stdout) {
        let packageDescription: SwiftPackageDescription = JSON.parse(stdout);

        result.push(this.getBuildTask([]));

        for (let target of packageDescription.targets) {
          if (target.type === TargetType.Executable) {
            result.push(this.getExecutableTask(target));
          }
        }

        if (
          packageDescription.targets.filter(
            (target) => target.type === TargetType.Test
          ).length !== 0
        ) {
          result.push(this.getTestTask());
        }
      }
      return result;
    } catch (err) {
      let channel = this.getOutputChannel();
      if (err.stderr) {
        channel.appendLine(err.stderr);
      }
      if (err.stdout) {
        channel.appendLine(err.stdout);
      }
      channel.appendLine("Auto detecting Swift Package Tasks failed.");
      channel.show(true);
      return result;
    }
  }

  getTestTask(): Task {
    let kind: SwiftPMTaskDefinition = {
      type: SwiftPMTaskProvider.taskType,
      task: "test",
      args: [],
    };

    let taskName = `test`;
    let task = new Task(
      kind,
      taskName,
      "swift-package",
      new ShellExecution(`swift ${kind.task}`)
    );
    task.group = TaskGroup.Test;
    task.isBackground = false;
    return task;
  }

  getExecutableTask(target: SwiftPMTarget): Task {
    let kind: SwiftPMTaskDefinition = {
      type: SwiftPMTaskProvider.taskType,
      task: "run",
      args: [],
    };

    let taskName = `run ${target.name}`;
    let task = new Task(
      kind,
      taskName,
      "swift-package",
      new ShellExecution(`swift ${kind.task}`)
    );
    // task.group = vscode.TaskGroup.Build;
    task.isBackground = false;
    return task;
  }

  getBuildTask(args: string[]): Task {
    let kind: SwiftPMTaskDefinition = {
      type: SwiftPMTaskProvider.taskType,
      task: "build",
      args: args, //["debug", "release"]
    };

    var taskName = "build";
    let task = new Task(
      kind,
      taskName,
      "swift-package",

      // TODO: Build Arguments
      new ShellExecution(`swift ${kind.task}`)
    );
    task.group = TaskGroup.Build;
    task.isBackground = false;
    return task;
  }

  exists(file: string): Promise<boolean> {
    return new Promise<boolean>((resolve, _reject) => {
      fs.exists(file, (value) => {
        resolve(value);
      });
    });
  }

  exec(
    command: string,
    options: child_process.ExecOptions
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        child_process.exec(command, options, (error, stdout, stderr) => {
          if (error) {
            reject({ error, stdout, stderr });
          }
          resolve({ stdout, stderr });
        });
      }
    );
  }
}

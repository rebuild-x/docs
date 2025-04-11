# How to Build Your Own CLI App in Zig from Scratch

Command-line interfaces (CLIs) are essential tools for developers, system administrators, and power users alike. In this tutorial, we'll walk through building a powerful and flexible CLI application in Zig from the ground up. By the end, you'll have a CLI framework that supports commands, options, error handling, and cross-platform compatibility.

## Introduction

The Zig programming language combines the performance of low-level languages with modern safety features, making it an excellent choice for developing CLI applications. We'll create a reusable CLI framework that can:

- Parse and handle commands
- Process short and long-form options with values
- Enforce required options
- Handle optional options
- Provide cross-platform compatibility (Windows, Linux, macOS)

Our approach will follow a clean, modular design that you can easily incorporate into your own projects.

## Prerequisites

- Basic familiarity with Zig syntax
- Zig compiler installed (version 0.11.0 or later recommended)
- A text editor or IDE with Zig support

## Project Structure

Let's start by setting up our project structure:

```
my-cli/
├── src/
│   ├── cli.zig       # Core CLI functionality
│   ├── commands.zig  # Command implementations
│   └── main.zig      # Main application entry point
├── build.zig         # Build configuration
└── README.md         # Documentation
```

## Step 1: Core CLI Types

First, let's define the core data structures for our CLI in `cli.zig`. We need types to represent commands and options:

```zig
const std = @import("std");
const builtin = @import("builtin");

pub const MAX_COMMANDS: u8 = 10;
pub const MAX_OPTIONS: u8 = 20;

const Byte = u8;
const Slice = []const Byte;
const Slices = []const Slice;

/// Structure to represent the type of command.
pub const command = struct {
    name: Slice,                     // Name of the command
    func: fnType,                    // Function to execute the command
    req: Slices = &.{},              // Required options
    opt: Slices = &.{},              // Optional options
    const fnType = *const fn ([]const option) bool;
};

/// Structure to represent the type of option.
pub const option = struct {
    name: Slice,                     // Name of the option
    func: ?fnType = null,            // Function to execute the option
    short: Byte,                     // Short form, e.g., -n|-N
    long: Slice,                     // Long form, e.g., --name
    value: Slice = "",               // Value of the option
    const fnType = *const fn (Slice) bool;
};

/// Possible errors during CLI execution
pub const Error = error{
    NoArgsProvided,
    UnknownCommand,
    UnknownOption,
    MissingRequiredOption,
    UnexpectedArgument,
    CommandExecutionFailed,
    TooManyCommands,
    TooManyOptions,
};
```

## Step 2: Command Parser Implementation

Now, let's build the core functionality that parses command-line arguments and executes commands:

```zig
/// Starts the CLI application.
pub fn start(commands: []const command, options: []const option, debug: bool) !void {
    if (commands.len > MAX_COMMANDS) {
        return error.TooManyCommands;
    }
    if (options.len > MAX_OPTIONS) {
        return error.TooManyOptions;
    }

    // Create a general-purpose allocator for managing memory during execution
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    // Retrieve the command-line arguments in a cross-platform manner
    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    try startWithArgs(commands, options, args, debug);
}

/// Starts the CLI application with provided arguments.
pub fn startWithArgs(commands: []const command, options: []const option, args: anytype, debug: bool) !void {
    if (args.len < 2) {
        if(debug) std.debug.print("No command provided by user!\n", .{});
        return Error.NoArgsProvided;
    }

    // Extract the name of the command (the second argument after the program name)
    const command_name = args[1];
    var detected_command: ?command = null;

    // Search through the list of available commands to find a match
    for (commands) |cmd| {
        if (std.mem.eql(u8, cmd.name, command_name)) {
            detected_command = cmd;
            break;
        }
    }

    // If no matching command is found, return an error
    if (detected_command == null) {
        if(debug) std.debug.print("Unknown command: {s}\n", .{command_name});
        return Error.UnknownCommand;
    }

    // Retrieve the matched command from the optional variable
    const cmd = detected_command.?;

    if(debug) std.debug.print("Detected command: {s}\n", .{cmd.name});

    // Allocate memory for detected options based on remaining arguments
    var detected_options: [MAX_OPTIONS]option = undefined;
    var detected_len: usize = 0;
    var i: usize = 2;

    // Parsing options to capture their values
    while (i < args.len) {
        const arg = args[i];

        if (std.mem.startsWith(u8, arg, "-")) {
            const option_name = if (std.mem.startsWith(u8, arg[1..], "-")) arg[2..] else arg[1..];
            var matched_option: ?option = null;

            for (options) |opt| {
                if (std.mem.eql(u8, option_name, opt.long) or (option_name.len == 1 and option_name[0] == opt.short)) {
                    matched_option = opt;
                    break;
                }
            }

            if (matched_option == null) {
                if(debug) std.debug.print("Unknown option: {s}\n", .{arg});
                return Error.UnknownOption;
            }

            var opt = matched_option.?;

            // Detect the value for the option
            if (i + 1 < args.len and !std.mem.startsWith(u8, args[i + 1], "-")) {
                opt.value = args[i + 1];
                i += 1;
            } else {
                opt.value = "";
            }

            if (detected_len >= MAX_OPTIONS) {
                return error.TooManyOptions;
            }

            detected_options[detected_len] = opt;
            detected_len += 1;
        } else {
            if(debug) std.debug.print("Unexpected argument: {s}\n", .{arg});
            return Error.UnexpectedArgument;
        }

        i += 1;
    }

    // Slice the detected options to the actual number of detected options
    const used_options = detected_options[0..detected_len];

    // Ensure all required options for the detected command are provided
    for (cmd.req) |req_option| {
        var found = false;

        for (used_options) |opt| {
            if (std.mem.eql(u8, req_option, opt.name)){
                found = true; break;
            }
        }

        if (!found) {
            if(debug) std.debug.print("Missing required option: {s}\n", .{req_option});
            return Error.MissingRequiredOption;
        }
    }

    // Execute the command's associated function with the detected options
    if (!cmd.func(used_options)) {
        return Error.CommandExecutionFailed;
    } else {
        // Execute option functions
        for (used_options) |opt| {
            if(opt.func == null) continue;

            const result = opt.func.?(opt.value);

            if (!result) {
                if(debug) std.debug.print("Option function execution failed: {s}\n", .{opt.name});
                return Error.CommandExecutionFailed;
            }
        }
    }

    // If execution reaches this point, the command was executed successfully
    if(debug) std.debug.print("Command executed successfully: {s}\n", .{cmd.name});
}
```

## Step 3: Creating Command Handlers

Next, let's implement some command handlers in `commands.zig`:

```zig
const std = @import("std");
const cli = @import("cli.zig");

pub const methods = struct {
    pub const commands = struct {
        // Handler for the "hello" command
        pub fn helloFn(_options: []const cli.option) bool {
            std.debug.print("Hello, ", .{});

            // Look for a "name" option
            for (_options) |opt| {
                if (std.mem.eql(u8, opt.name, "name")) {
                    if (opt.value.len > 0) {
                        std.debug.print("{s}", .{opt.value});
                    } else {
                        std.debug.print("World", .{});
                    }
                    break;
                }
            }

            std.debug.print("!\n", .{});
            return true;
        }

        // Handler for the "help" command
        pub fn helpFn(_: []const cli.option) bool {
            std.debug.print(
                "Usage: my-cli <command> [options]\n" ++
                "Commands:\n" ++
                "  hello    Greet someone\n" ++
                "  help     Show this help message\n" ++
                "" ++
                "Options for hello:\n" ++
                "  -n, --name <value>    Name to greet\n"
                , .{}
            );
            return true;
        }
    };

    pub const options = struct {
        // Handler for the "name" option
        pub fn nameFn(_: []const u8) bool {
            // Option-specific logic could go here
            return true;
        }
    };
};
```

## Step 4: Main Application

Now, let's tie everything together in `main.zig`:

```zig
const std = @import("std");
const cli = @import("cli.zig");
const cmd = @import("commands.zig");

pub fn main() !void {
    // Define available commands
    const commands = [_]cli.command{
        cli.command{
            .name = "hello",
            .func = &cmd.methods.commands.helloFn,
            .opt = &.{"name"},  // "name" is optional for the hello command
        },
        cli.command{
            .name = "help",
            .func = &cmd.methods.commands.helpFn,
        },
    };

    // Define available options
    const options = [_]cli.option{
        cli.option{
            .name = "name",
            .short = 'n',
            .long = "name",
            .func = &cmd.methods.options.nameFn,
        },
    };

    // Start the CLI application
    try cli.start(&commands, &options, true);
}
```

## Step 5: Build Configuration

- ### Create a `build.zig` file:

    ```zig
    const Build = @import("std").Build;

    pub fn build(b: *Build) void {
        const exe_mod           = b.createModule(.{
            .root_source_file   = b.path("src/main.zig"),
            .target             = b.standardTargetOptions(.{}),
            .optimize           = b.standardOptimizeOption(.{}),
        });

        const exe               = b.addExecutable(.{
            .name               = "cli",
            .root_module        = exe_mod,
        });

        b.installArtifact(exe);

        const exe_tests         = b.addTest(.{
            .root_module        = exe_mod,
        });

        const run_exe_tests     = b.addRunArtifact(exe_tests);

        const test_step         = b.step("test", "Run unit tests");
        test_step.dependOn(&run_exe_tests.step);
    }
    ```

- ### Create a `build.zig.zon` file:

    ```zig
    .{
        .name = .cli,

        .version = "0.0.0",

        .minimum_zig_version = "0.15.0-dev.64+2a4e06bcb",

        .fingerprint = 0xd5b3a843fb43c32a,

        .paths = .{
            "build.zig", "build.zig.zon", "src",
        },

        // No dependencies.
    }
    ```

## Step 6: Testing Your CLI

Build and run your CLI application:

```bash
$ zig build
$ ./zig-out/bin/my-cli help
Usage: my-cli <command> [options]

Commands:
  hello    Greet someone
  help     Show this help message

Options for hello:
  -n, --name <value>    Name to greet

$ ./zig-out/bin/my-cli hello
Hello, World!

$ ./zig-out/bin/my-cli hello -n Alice
Hello, Alice!

$ ./zig-out/bin/my-cli hello --name Bob
Hello, Bob!
```

## Advanced Features

Now that we have a basic CLI framework, let's explore some advanced features:

### 1. Adding Required Options

Let's modify our hello command to require a greeting option:

```zig
// In main.zig
const commands = [_]cli.command{
    cli.command{
        .name = "hello",
        .func = &cmd.methods.commands.helloFn,
        .req = &.{"greeting"},  // "greeting" is required
        .opt = &.{"name"},      // "name" remains optional
    },
    // ...
};

const options = [_]cli.option{
    cli.option{
        .name = "name",
        .short = 'n',
        .long = "name",
        .func = &cmd.methods.options.nameFn,
    },
    cli.option{
        .name = "greeting",
        .short = 'g',
        .long = "greeting",
        .func = &cmd.methods.options.greetingFn,
    },
};
```

Update the hello command handler in `commands.zig`:

```zig
pub fn helloFn(options: []const cli.option) bool {
    var greeting: []const u8 = undefined;
    var name: []const u8 = "World";

    // Extract options
    for (options) |opt| {
        if (std.mem.eql(u8, opt.name, "greeting")) {
            greeting = opt.value;
        } else if (std.mem.eql(u8, opt.name, "name")) {
            if (opt.value.len > 0) {
                name = opt.value;
            }
        }
    }

    std.debug.print("{s}, {s}!\n", .{greeting, name});
    return true;
}
```

### 2. Command Groups

You might want to organize your commands into groups. Let's add this capability:

```zig
// In main.zig
const commands = [_]cli.command{
    // User commands
    cli.command{
        .name = "user:create",
        .func = &cmd.methods.commands.userCreateFn,
        .req = &.{"username"},
    },
    cli.command{
        .name = "user:list",
        .func = &cmd.methods.commands.userListFn,
    },
    // Config commands
    cli.command{
        .name = "config:set",
        .func = &cmd.methods.commands.configSetFn,
        .req = &.{"key", "value"},
    },
    cli.command{
        .name = "config:get",
        .func = &cmd.methods.commands.configGetFn,
        .req = &.{"key"},
    },
    // ...
};
```

### 3. Adding Colors and Styled Output

To make your CLI more user-friendly, consider adding colors and styling:

```zig
// Add to cli.zig
pub const Color = enum {
    Reset,
    Black,
    Red,
    Green,
    Yellow,
    Blue,
    Magenta,
    Cyan,
    White,

    pub fn ansiCode(self: Color) []const u8 {
        return switch (self) {
            .Reset => "\x1b[0m",
            .Black => "\x1b[30m",
            .Red => "\x1b[31m",
            .Green => "\x1b[32m",
            .Yellow => "\x1b[33m",
            .Blue => "\x1b[34m",
            .Magenta => "\x1b[35m",
            .Cyan => "\x1b[36m",
            .White => "\x1b[37m",
        };
    }
};

pub fn printColored(color: Color, comptime fmt: []const u8, args: anytype) void {
    std.debug.print("{s}" ++ fmt ++ "{s}", .{color.ansiCode()} ++ args ++ .{Color.Reset.ansiCode()});
}
```

Use in your commands:

```zig
// In commands.zig
pub fn helloFn(options: []const cli.option) bool {
    var greeting: []const u8 = undefined;
    var name: []const u8 = "World";

    // Extract options (as before)

    cli.printColored(.Green, "{s}, ", .{greeting});
    cli.printColored(.Cyan, "{s}", .{name});
    cli.printColored(.Yellow, "!\n", .{});
    return true;
}
```

### 4. Progress Indicators

For long-running commands, add a progress indicator:

```zig
// In cli.zig
pub const Spinner = struct {
    frames: []const []const u8,
    current: usize = 0,
    message: []const u8,
    timer: std.time.Timer,

    pub fn init(message: []const u8) !Spinner {
        return Spinner{
            .frames = &[_][]const u8{ "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" },
            .message = message,
            .timer = try std.time.Timer.start(),
            .current = 0,
        };
    }

    pub fn tick(self: *Spinner) void {
        const stdout = std.io.getStdOut().writer();
        _ = stdout.print("\r{s} {s}", .{self.frames[self.current], self.message}) catch {};
        self.current = (self.current + 1) % self.frames.len;
    }

    pub fn stop(self: *Spinner, message: []const u8) void {
        const stdout = std.io.getStdOut().writer();
        _ = stdout.print("\r✓ {s}\n", .{message}) catch {};
    }
};

// Usage in commands.zig
pub fn longRunningCommandFn(_: []const cli.option) bool {
    var spinner = cli.Spinner.init("Processing...") catch |err| {
        std.debug.print("Failed to initialize spinner: {}\n", .{err});
        return false;
    };

    // Simulate work
    var i: usize = 0;
    while (i < 50) : (i += 1) {
        spinner.tick();
        std.time.sleep(100 * std.time.ns_per_ms);
    }

    spinner.stop("Done processing!");
    return true;
}
```

## Conclusion

Congratulations! You've built a powerful CLI application framework in Zig from scratch. Your CLI framework now supports:

- Command parsing and execution
- Short and long-form options
- Required and optional options
- Error handling
- Cross-platform compatibility
- Colored output
- Progress indicators

This foundation provides everything you need to build sophisticated command-line tools in Zig. You can expand on this framework to add subcommands, interactive prompts, autocompletion, and more.

## Next Steps

Consider these enhancements to take your CLI framework to the next level:

1. **Interactive Mode**: Add support for interactive prompts and menus
2. **Configuration Management**: Implement persistent configuration using files
3. **Autocomplete**: Add shell autocompletion support
4. **Testing**: Create unit tests for your CLI components
5. **Documentation Generation**: Auto-generate usage and help documentation

Zig's combination of low-level performance and modern safety features makes it an excellent choice for CLI applications. With this foundation, you can build tools that are fast, reliable, and user-friendly.

Happy coding!

---

*This tutorial was inspired by the [SuperZIG/io](https://github.com/Super-ZIG/io) library, which provides robust terminal utilities for Zig applications.*

For the full code without following the steps, visit the [GitHub repository](https://github.com/for-zig/cli).
```
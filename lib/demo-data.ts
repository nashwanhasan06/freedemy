import type { Course } from "@/lib/types";

/**
 * Seed content for the demo. Generation is out of scope for this UI build, so
 * every course below is pre-built: chapters, sections, notes and assignments
 * already exist, exactly like a finished generation run would leave them.
 * Videos are embedded from YouTube — nothing is downloaded or re-hosted.
 */
export const DEMO_COURSES: Course[] = [
  {
    slug: "python-fundamentals",
    title: "Python Fundamentals: Types, Control Flow & Functions",
    channel: "freeCodeCamp.org",
    videoId: "rfscVS0vtbw",
    description:
      "A beginner-friendly pass over Python's core — types, control flow and functions — split into short sections with a checkpoint after every concept.",
    level: "Beginner",
    seeded: {
      "why-python": 85,
      setup: 100,
      variables: 60,
      strings: 55,
      loops: 45,
    },
    chapters: [
      {
        id: "ch-1",
        title: "Getting started",
        lessons: [
          {
            id: "why-python",
            title: "Why Python, and what it's good for",
            start: 0,
            end: 430,
            summary:
              "Python trades a little speed for a lot of readability. This section covers where that trade pays off, and where it quietly stops being the right tool.",
            keyTerms: [
              {
                term: "Interpreter",
                definition:
                  "A program that runs your source code by turning it into bytecode and executing that, instead of producing a binary up front.",
              },
              {
                term: "Readability",
                definition:
                  "Python's use of indentation and plain keywords to show structure, so the shape of the code is visible at a glance.",
              },
              {
                term: "Standard library",
                definition:
                  "The modules that ship with Python and already handle files, dates, HTTP, JSON and more.",
              },
            ],
            notes: [
              {
                heading: "Where Python fits",
                bullets: [
                  "Strong for scripting, data work, web backends and teaching.",
                  "Slower than compiled languages, but most of that cost hides inside C libraries.",
                  "The standard library covers files, dates, HTTP and JSON without extra installs.",
                ],
              },
              {
                heading: "How a program actually runs",
                bullets: [
                  "You write a .py file; the interpreter compiles it to bytecode, then runs the bytecode.",
                  "Nothing becomes a standalone binary, so the machine needs Python installed.",
                  "Errors surface at runtime — which is why tests matter more here than in a compiled language.",
                ],
              },
            ],
            questions: [
              {
                id: "why-python-q1",
                prompt:
                  "Someone says Python is 'compiled to bytecode, then interpreted'. What does that mean in practice?",
                options: [
                  "The .py file ships as a standalone binary",
                  "Bytecode is generated for a virtual machine, which executes it at runtime",
                  "Python compiles straight to machine code on first run",
                  "Bytecode is only produced when you add type hints",
                ],
                answer: 1,
                misconception:
                  "You're treating bytecode as if it were a native binary — Python still needs the interpreter at runtime.",
                explanation:
                  "CPython compiles source to bytecode once and the virtual machine executes it on every run. You still ship source plus a Python that can run it.",
                at: 186,
              },
              {
                id: "why-python-q2",
                prompt: "Which job is Python the weakest fit for?",
                options: [
                  "A one-off script that renames 4,000 files",
                  "A pipeline that reshapes CSVs for a report",
                  "A latency-critical audio engine",
                  "An internal REST API",
                ],
                answer: 2,
                misconception:
                  "Python is excellent for data and automation, but per-sample real-time work belongs in a compiled language.",
                explanation:
                  "Audio processing constrains latency per sample. The interpreter's per-operation overhead becomes the bottleneck, so audio engines are written in C or Rust.",
                at: 305,
              },
            ],
            shortAnswer: {
              prompt: "In your own words, what happens when you run a Python script?",
              placeholder:
                "e.g. The interpreter turns my file into bytecode, then a virtual machine runs it...",
              keywords: ["bytecode", "interpret", "virtual machine", "runtime", "line"],
              model:
                "The interpreter compiles the source to bytecode, then a virtual machine executes that bytecode, stopping at the first error it hits during the run.",
              misconception:
                "You described Python as compiling your script to a machine-code binary.",
              explanation:
                "Nothing in the interpreter produces a native executable; bytecode is run by the virtual machine, which is why Python must be installed.",
              at: 205,
            },
            practiceBank: [
              {
                id: "why-python-p1",
                prompt: "What does the standard library give you without installing anything?",
                options: [
                  "Data-frame operations like pandas",
                  "Files, dates, HTTP and JSON handling",
                  "A browser automation driver",
                  "GPU acceleration for arrays",
                ],
                answer: 1,
                misconception:
                  "You credited the standard library with a third-party package — pandas is installed separately.",
                explanation:
                  "Files, dates, HTTP and JSON ship with Python. Data frames and browser drivers come from packages on PyPI.",
                at: 120,
                practice: true,
              },
            ],
          },
          {
            id: "setup",
            title: "Installing Python and running your first file",
            start: 430,
            end: 900,
            summary:
              "A working setup is three decisions: which Python, which editor, and how you run a file. Get those straight once and the rest of the course is just syntax.",
            keyTerms: [
              {
                term: "PATH",
                definition:
                  "The list of folders your shell searches for commands, which is how typing `python` finds an executable.",
              },
              {
                term: "REPL",
                definition:
                  "The interactive prompt that reads one statement, evaluates it and prints the result.",
              },
            ],
            notes: [
              {
                heading: "A setup that won't fight you",
                bullets: [
                  "Install from python.org and tick 'Add Python to PATH' during setup.",
                  "Use one editor for everything; VS Code with the Python extension is enough.",
                  "Keep each project in its own folder so imports stay predictable.",
                ],
              },
              {
                heading: "Two ways to run code",
                bullets: [
                  "`python file.py` runs a whole file top to bottom.",
                  "`python` alone opens the REPL, which is best for quick checks rather than real programs.",
                ],
              },
            ],
            questions: [
              {
                id: "setup-q1",
                prompt:
                  "You type `python hello.py` and the shell says command not found. What is the most likely cause?",
                options: [
                  "The file has a syntax error",
                  "Python isn't on your PATH",
                  "The file must end in .pyc",
                  "Python cannot run files on Windows",
                ],
                answer: 1,
                misconception:
                  "A 'command not found' error is about the shell locating Python, not about your code being wrong.",
                explanation:
                  "'command not found' means the shell searched PATH and found no matching executable. Fix the install or PATH entry, then the file runs.",
                at: 610,
              },
              {
                id: "setup-q2",
                prompt: "When is the REPL the better tool?",
                options: [
                  "Shipping a script to someone else",
                  "Checking what a single expression evaluates to",
                  "Running a program that reads arguments",
                  "Installing packages",
                ],
                answer: 1,
                misconception:
                  "You picked the REPL for something that needs a repeatable file — the REPL is for one-off checks.",
                explanation:
                  "The REPL is a scratchpad: type an expression, see the value. Anything you need to keep or re-run belongs in a file.",
                at: 720,
              },
            ],
            shortAnswer: {
              prompt: "Describe the two ways to execute Python code and when you'd use each.",
              placeholder: "Files are for... the REPL is for...",
              keywords: ["file", "repl", "interactive", "script"],
              model:
                "A file runs top to bottom with `python file.py` and is what you keep; the REPL evaluates one statement at a time and is for quick experiments.",
              misconception: "You only described one of the two execution modes.",
              explanation:
                "Both matter: files are repeatable and shareable, the REPL is immediate and disposable.",
              at: 800,
            },
            practiceBank: [
              {
                id: "setup-p1",
                prompt: "Why keep each project in its own folder?",
                options: [
                  "Python refuses to import across folders",
                  "It keeps imports and dependencies predictable",
                  "It makes the interpreter faster",
                  "Folders are required for the REPL",
                ],
                answer: 1,
                misconception:
                  "Isolation isn't a Python limitation — it's what stops one project's packages from shadowing another's.",
                explanation:
                  "Separate folders (and a virtual environment inside each) stop two projects from resolving the same import to different versions.",
                at: 520,
                practice: true,
              },
            ],
          },
        ],
      },
      {
        id: "ch-2",
        title: "Core types",
        lessons: [
          {
            id: "variables",
            title: "Variables, assignment and type errors",
            start: 900,
            end: 1310,
            summary:
              "A name in Python points at a value rather than holding a box of memory. That single fact explains reassignment, shared lists and most type errors.",
            keyTerms: [
              {
                term: "Assignment",
                definition:
                  "`=` binds a name to the object on the right. Rebinding a name never changes the old object.",
              },
              {
                term: "Dynamic typing",
                definition:
                  "Types belong to values, not to names, so a name can point at a different type later.",
              },
              {
                term: "TypeError",
                definition:
                  "Raised when an operation gets a value of the wrong type, such as adding a string to an integer.",
              },
            ],
            notes: [
              {
                heading: "Names point at values",
                bullets: [
                  "`x = 5` binds the name x to the integer 5.",
                  "`x = \"five\"` rebinds the name; the integer is untouched.",
                  "Two names can point at the same object, which is why mutating one can surprise you.",
                ],
              },
              {
                heading: "Reading a type error",
                bullets: [
                  "Python tells you the type it got, e.g. `unsupported operand type(s) for +: 'int' and 'str'`.",
                  "The fix is almost always converting before combining, not adding a broad try/except.",
                ],
              },
            ],
            questions: [
              {
                id: "variables-q1",
                prompt: "After `a = [1, 2]` and `b = a`, you run `b.append(3)`. What is `a`?",
                options: [
                  "[1, 2] — a is unchanged",
                  "[1, 2, 3] — a and b point at the same list",
                  "An error, because b is a copy",
                  "[3] — b replaced a",
                ],
                answer: 1,
                misconception:
                  "You assumed assignment copies the list. Assignment only binds a second name to the same object.",
                explanation:
                  "`b = a` copies the reference, not the list, so mutating through either name is visible through both. Use `a.copy()` or `list(a)` for a real copy.",
                at: 1010,
              },
              {
                id: "variables-q2",
                prompt: "What does `\"2\" + 2` do?",
                options: [
                  "Returns 4",
                  "Returns \"22\"",
                  "Raises a TypeError",
                  "Returns None",
                ],
                answer: 2,
                misconception:
                  "You expected Python to convert the string automatically — it never does implicit string-to-number conversion.",
                explanation:
                  "`+` on a string and an int has no defined meaning, so Python raises `TypeError: unsupported operand type(s)`. Convert first with `int(\"2\")`.",
                at: 1180,
              },
            ],
            shortAnswer: {
              prompt: "Why can rebinding a name never change the object it used to point at?",
              placeholder: "Because assignment binds a name to an object...",
              keywords: ["bind", "reference", "object", "name", "point"],
              model:
                "Assignment binds a name to an object. Rebinding swaps which object the name points at; it never mutates the object the name previously referenced.",
              misconception:
                "You described assignment as writing into a fixed box of memory that the name owns.",
              explanation:
                "Names are labels on objects. Rebinding moves the label; only mutating methods change the object itself.",
              at: 1050,
            },
            practiceBank: [
              {
                id: "variables-p1",
                prompt: "Which value does the name have after `x = 1` then `x = x + 1`?",
                options: ["1", "2", "An error", "None"],
                answer: 1,
                misconception:
                  "You read the second line as reassigning the same object instead of computing a new value first.",
                explanation:
                  "The right side is evaluated first (`1 + 1`), producing a new integer 2, and only then is the name rebound.",
                at: 960,
                practice: true,
              },
            ],
          },
          {
            id: "strings",
            title: "Strings, slicing and formatting",
            start: 1310,
            end: 1820,
            summary:
              "Strings are immutable sequences. Once you know indexing, slicing and f-strings, most text handling stops being guesswork.",
            keyTerms: [
              {
                term: "Immutable",
                definition:
                  "Methods like `.upper()` return a new string; the original is never modified.",
              },
              {
                term: "Slice",
                definition:
                  "`text[start:stop]` copies a range of characters, where `stop` is excluded.",
              },
              {
                term: "f-string",
                definition:
                  "A string prefixed with f whose `{...}` placeholders are evaluated and inserted at runtime.",
              },
            ],
            notes: [
              {
                heading: "Indexing and slicing",
                bullets: [
                  "Indexing starts at 0; `-1` is the last character.",
                  "`text[2:5]` includes index 2 and stops before index 5.",
                  "Slicing never raises on out-of-range bounds — it clamps.",
                ],
              },
              {
                heading: "Formatting",
                bullets: [
                  "`f\"{name} scored {score:.1f}%\"` handles text, rounding and layout in one step.",
                  "`+=` on a string in a loop rebuilds the whole string each time; join a list instead.",
                ],
              },
            ],
            questions: [
              {
                id: "strings-q1",
                prompt: "What is `\"python\"[1:4]`?",
                options: ["\"pyt\"", "\"yth\"", "\"ytho\"", "\"tho\""],
                answer: 1,
                misconception:
                  "You included the stop index. A slice ends just before `stop`.",
                explanation:
                  "Index 1 is `y`, and the slice ends before index 4, so it returns characters at 1, 2 and 3: `yth`.",
                at: 1420,
              },
              {
                id: "strings-q2",
                prompt: "What does `name.upper()` do to `name`?",
                options: [
                  "Converts name to uppercase in place",
                  "Returns a new uppercase string and leaves name unchanged",
                  "Raises an error because strings are immutable",
                  "Returns the same string object",
                ],
                answer: 1,
                misconception:
                  "You expected an in-place change. String methods return new strings — the variable keeps the original unless you reassign it.",
                explanation:
                  "Strings are immutable, so `upper()` returns a new string. Without `name = name.upper()` the variable still holds the original value.",
                at: 1600,
              },
            ],
            shortAnswer: {
              prompt: "Why is building a big string with `+=` inside a loop slower than joining a list?",
              placeholder: "Because strings are immutable, so each += ...",
              keywords: ["immutable", "copy", "new", "join", "allocate"],
              model:
                "Every `+=` allocates a new string and copies the characters so far, so the work grows with the square of the length. `join` allocates once.",
              misconception:
                "You described `+=` as appending into existing storage — immutable strings can't grow in place.",
              explanation:
                "Each concatenation copies the accumulated content. Joining a list measures the total length once and allocates a single result.",
              at: 1720,
            },
            practiceBank: [
              {
                id: "strings-p1",
                prompt: "What is `len(\"python\")`?",
                options: ["5", "6", "7", "Error"],
                answer: 1,
                misconception: "You may be counting from 1 or mixing up length with the highest index.",
                explanation:
                  "`len` counts characters: p-y-t-h-o-n is 6. The highest valid index is 5.",
                at: 1370,
                practice: true,
              },
            ],
          },
        ],
      },
      {
        id: "ch-3",
        title: "Control flow",
        lessons: [
          {
            id: "conditionals",
            title: "Comparisons and if / elif / else",
            start: 1820,
            end: 2260,
            summary:
              "Conditions are ordinary expressions that produce True or False. The only real trap is treating a falsy value as if it were the same thing as False.",
            keyTerms: [
              {
                term: "Truthiness",
                definition:
                  "Empty strings, empty lists, 0 and None are falsy; most other values are truthy.",
              },
              {
                term: "elif",
                definition:
                  "A chained test that only runs when every earlier condition was false.",
              },
              {
                term: "Short-circuit",
                definition:
                  "`and` / `or` stop evaluating as soon as the result is decided.",
              },
            ],
            notes: [
              {
                heading: "Reading an if statement",
                bullets: [
                  "The first true branch wins; later branches never run.",
                  "`elif` exists so you don't nest ifs for mutually exclusive cases.",
                  "Indentation defines the block — there are no braces to fall back on.",
                ],
              },
              {
                heading: "Falsy values, not just False",
                bullets: [
                  "`if items:` is the idiomatic empty-list check.",
                  "`if items is None:` is a different question and should be written differently.",
                  "Use `is None` rather than `== None` to compare against None.",
                ],
              },
            ],
            questions: [
              {
                id: "conditionals-q1",
                prompt: "What prints?\n\n```\nscore = 0\nif score:\n    print(\"pass\")\nelse:\n    print(\"no score\")\n```",
                options: ["pass", "no score", "nothing", "an error"],
                answer: 1,
                misconception:
                  "You read `if score` as 'if score exists'. It tests truthiness, and 0 is falsy.",
                explanation:
                  "`if score:` evaluates the value itself. Zero is falsy, so the else branch runs and prints `no score`.",
                at: 1930,
              },
              {
                id: "conditionals-q2",
                prompt: "In `a and b`, when is `b` never evaluated?",
                options: [
                  "Always — `and` evaluates left to right only",
                  "When `a` is falsy",
                  "When `b` is falsy",
                  "Never — both sides always run",
                ],
                answer: 1,
                misconception:
                  "You assumed both operands are always evaluated. `and` short-circuits on a falsy left side.",
                explanation:
                  "A falsy left operand settles the result, so the right side is skipped. This is what makes `if user and user.name` safe.",
                at: 2080,
              },
            ],
            shortAnswer: {
              prompt: "Why is `if items:` usually better than `if len(items) > 0:`?",
              placeholder: "Because an empty collection is falsy, so...",
              keywords: ["falsy", "empty", "iterator", "idiomatic", "truth"],
              model:
                "An empty collection is falsy, so `if items:` expresses the intent directly and also works for iterators, where calling len() would fail.",
              misconception:
                "You framed the shorter form as purely stylistic; it also handles objects that have no length.",
              explanation:
                "Both are correct for lists, but truthiness works for anything truth-testable, including generators, and reads as intent rather than as arithmetic.",
              at: 2160,
            },
            practiceBank: [
              {
                id: "conditionals-p1",
                prompt: "Which value is truthy?",
                options: ["0", "\"\"", "[]", "\"0\""],
                answer: 3,
                misconception:
                  "You treated the string containing a zero as the number zero — a non-empty string is truthy.",
                explanation:
                  "Truthiness looks at emptiness, not at what the text says. `\"0\"` has one character, so it is truthy.",
                at: 1990,
                practice: true,
              },
            ],
          },
          {
            id: "loops",
            title: "Loops, range and breaking out",
            start: 2260,
            end: 2700,
            summary:
              "`for` walks through values, `while` repeats on a condition. Most loop bugs are off-by-one errors caused by translating `range` from another language.",
            keyTerms: [
              {
                term: "range",
                definition:
                  "`range(stop)` counts from 0 up to but not including stop; `range(start, stop)` sets the start.",
              },
              {
                term: "break / continue",
                definition:
                  "`break` leaves the loop entirely; `continue` skips to the next iteration.",
              },
              {
                term: "Infinite loop",
                definition:
                  "A `while` whose condition never becomes false — every branch of the body must make progress.",
              },
            ],
            notes: [
              {
                heading: "range is half-open",
                bullets: [
                  "`range(5)` yields 0,1,2,3,4 — five values, last index 4.",
                  "`range(1, 4)` yields 1,2,3.",
                  "Iterating `for i in range(len(items))` is usually a sign to iterate the items directly.",
                ],
              },
              {
                heading: "Escaping a loop",
                bullets: [
                  "`break` exits on the first match, which is what you want for a search.",
                  "`continue` is for skipping a bad value, not for restructuring the whole loop.",
                  "An `else` on a `for` runs only when no `break` happened — useful for 'not found'.",
                ],
              },
            ],
            questions: [
              {
                id: "loops-q1",
                prompt: "How many times does `for i in range(3): print(i)` print?",
                options: ["3 times: 0, 1, 2", "3 times: 1, 2, 3", "4 times: 0-3", "2 times: 0, 1"],
                answer: 0,
                misconception:
                  "You included the stop value. `range` stops before it, so 3 itself is never produced.",
                explanation:
                  "`range(3)` produces 0, 1, 2 — three values, stopping before 3. That is why `range(n)` pairs naturally with `len`.",
                at: 2380,
              },
              {
                id: "loops-q2",
                prompt:
                  "You want to stop the search as soon as a matching item is found. Which statement belongs in the loop?",
                options: ["continue", "break", "pass", "return None"],
                answer: 1,
                misconception:
                  "You reached for `continue`, which skips the rest of one iteration but keeps looping afterwards.",
                explanation:
                  "`break` terminates the loop immediately. `continue` moves to the next item, so the search would keep scanning.",
                at: 2550,
              },
            ],
            shortAnswer: {
              prompt: "Explain the difference between `break` and `continue` with one example each.",
              placeholder: "break ends... continue skips...",
              keywords: ["break", "continue", "exit", "skip", "iteration"],
              model:
                "`break` leaves the loop entirely — stop searching once the target is found. `continue` skips the rest of the current iteration but keeps looping — ignore blank input rows.",
              misconception:
                "You described `continue` as ending the loop, which is `break`.",
              explanation:
                "`break` exits; `continue` advances. Reaching for the wrong one either keeps scanning after a hit or abandons the remaining items.",
              at: 2620,
            },
            practiceBank: [
              {
                id: "loops-p1",
                prompt: "What does `range(1, 4)` produce?",
                options: ["1, 2, 3, 4", "1, 2, 3", "0, 1, 2, 3", "2, 3, 4"],
                answer: 1,
                misconception: "You included the stop bound, which `range` always excludes.",
                explanation: "The sequence starts at 1 and stops before 4, so it yields 1, 2, 3.",
                at: 2430,
                practice: true,
              },
            ],
          },
        ],
      },
      {
        id: "ch-4",
        title: "Functions",
        lessons: [
          {
            id: "functions",
            title: "Defining functions, arguments and return values",
            start: 2700,
            end: 3180,
            summary:
              "A function is a named block with its own scope. Arguments come in and one value goes out — everything else about functions follows from those two rules.",
            keyTerms: [
              {
                term: "Parameter vs argument",
                definition:
                  "The parameter is the name in the definition; the argument is the value you pass at the call.",
              },
              {
                term: "Return value",
                definition:
                  "What the caller receives. A function with no return statement returns None.",
              },
              {
                term: "Local scope",
                definition:
                  "Names created inside a function disappear when it returns, unless returned or otherwise stored.",
              },
            ],
            notes: [
              {
                heading: "Inputs and outputs",
                bullets: [
                  "Parameters are local names; arguments are the values you pass.",
                  "`return` sends one value back and ends the function immediately.",
                  "Without `return`, the call evaluates to None — this is behind most 'why is it None' bugs.",
                ],
              },
              {
                heading: "Keep functions small",
                bullets: [
                  "One job per function makes the name easy to write.",
                  "Return values instead of printing inside, so the function can be tested.",
                  "Mutable defaults like `def add(item, box=[])` are shared across calls — use None as the default.",
                ],
              },
            ],
            questions: [
              {
                id: "functions-q1",
                prompt: "What does a function call evaluate to when the function has no `return` statement?",
                options: ["0", "An empty string", "None", "It raises an error"],
                answer: 2,
                misconception:
                  "You expected an empty value like 0 or \"\". A missing return yields None, which is a real value.",
                explanation:
                  "Python implicitly returns None at the end of any function without a return, so the caller receives None rather than an error.",
                at: 2830,
              },
              {
                id: "functions-q2",
                prompt: "Why is `def add(item, box=[])` risky?",
                options: [
                  "Lists cannot be default arguments",
                  "The same list is shared across every call",
                  "It raises a SyntaxError",
                  "It copies the list on each call",
                ],
                answer: 1,
                misconception:
                  "You assumed defaults are rebuilt per call. They are evaluated once, when the function is defined.",
                explanation:
                  "Default values are created once at definition time, so appending to `box` accumulates across calls. Default to None and create the list inside.",
                at: 3020,
              },
            ],
            shortAnswer: {
              prompt: "Why does returning a value beat printing it inside the function?",
              placeholder: "Because a returned value can be...",
              keywords: ["test", "reuse", "chain", "compose", "value"],
              model:
                "A returned value can be tested, stored, combined and reused; printing only produces output the caller cannot inspect or build on.",
              misconception:
                "You framed printing as equivalent to returning, but printing is a side effect the caller cannot capture.",
              explanation:
                "Returning keeps the function a pure transformation, which is what makes it testable and composable with other functions.",
              at: 3100,
            },
            practiceBank: [
              {
                id: "functions-p1",
                prompt: "What is the name in the definition called?",
                options: ["Argument", "Parameter", "Keyword", "Signature"],
                answer: 1,
                misconception:
                  "You used the calling-side word for the defining-side name — they are different things.",
                explanation:
                  "The definition lists parameters; the call supplies arguments. Mixing them up makes error messages harder to read.",
                at: 2760,
                practice: true,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "javascript-essentials",
    title: "JavaScript Essentials: Scope, Functions & Arrays",
    channel: "freeCodeCamp.org",
    videoId: "PkZNo7MFNFg",
    description:
      "The parts of JavaScript you use every day — scope, functions and arrays — turned into short sections you can check yourself on.",
    level: "Beginner",
    seeded: { "running-js": 100 },
    chapters: [
      {
        id: "js-ch-1",
        title: "Language basics",
        lessons: [
          {
            id: "running-js",
            title: "How JavaScript runs",
            start: 0,
            end: 380,
            summary:
              "JavaScript runs inside a host — a browser or Node. The event loop is what lets one thread stay responsive while work waits.",
            keyTerms: [
              {
                term: "Event loop",
                definition:
                  "The loop that pulls queued callbacks onto the single main thread whenever the current task finishes.",
              },
              { term: "Host", definition: "The environment supplying globals like `document` or `process`." },
            ],
            notes: [
              {
                heading: "One thread, many tasks",
                bullets: [
                  "Synchronous code runs to completion; callbacks wait in a queue.",
                  "A long synchronous loop blocks everything, including the UI.",
                ],
              },
            ],
            questions: [
              {
                id: "running-js-q1",
                prompt: "What does the event loop do?",
                options: [
                  "Runs code on several threads at once",
                  "Runs queued callbacks when the current task finishes",
                  "Compiles JavaScript to machine code",
                  "Manages browser tabs",
                ],
                answer: 1,
                misconception:
                  "You described parallelism. JavaScript's main thread executes one task at a time.",
                explanation:
                  "Work is queued and taken up only when the current task returns, which is why blocking loops freeze the page.",
                at: 190,
              },
            ],
            shortAnswer: {
              prompt: "Why does a long synchronous loop freeze a page?",
              placeholder: "Because the main thread is busy...",
              keywords: ["thread", "block", "queue", "render"],
              model:
                "The loop occupies the single main thread, so queued render and input tasks cannot run until it returns.",
              misconception: "You described rendering as happening on a separate thread from script.",
              explanation:
                "Rendering and input handling share the main thread with your code, so anything that doesn't yield starves them.",
              at: 300,
            },
            practiceBank: [
              {
                id: "running-js-p1",
                prompt: "Which global is supplied by the host, not the language?",
                options: ["Array", "JSON", "document", "Promise"],
                answer: 2,
                misconception: "You picked a language built-in. `document` only exists in a browser host.",
                explanation:
                  "Array, JSON and Promise are part of the language. `document` comes from the browser environment.",
                at: 120,
                practice: true,
              },
            ],
          },
          {
            id: "let-const",
            title: "let, const and block scope",
            start: 380,
            end: 820,
            summary:
              "`const` stops rebinding, not mutation. Understanding that difference prevents most of the confusion around what 'constant' means.",
            keyTerms: [
              {
                term: "Block scope",
                definition: "`let` and `const` live only inside the nearest pair of braces.",
              },
              {
                term: "Temporal dead zone",
                definition:
                  "The span before a `let`/`const` declaration where the name exists but cannot be read.",
              },
            ],
            notes: [
              {
                heading: "Picking a declaration",
                bullets: [
                  "Default to `const`; switch to `let` only when you reassign.",
                  "`const` prevents rebinding, but an object it points at can still be mutated.",
                ],
              },
            ],
            questions: [
              {
                id: "let-const-q1",
                prompt: "With `const user = { name: \"Ada\" }`, which line throws?",
                options: [
                  "user.name = \"Grace\"",
                  "user = { name: \"Grace\" }",
                  "console.log(user.name)",
                  "Object.keys(user)",
                ],
                answer: 1,
                misconception:
                  "You read `const` as making the object immutable. It only prevents reassigning the name.",
                explanation:
                  "Reassigning `user` throws, but mutating a property is allowed because const constrains the binding, not the value.",
                at: 560,
              },
            ],
            shortAnswer: {
              prompt: "What does `const` actually guarantee?",
              placeholder: "It guarantees the name cannot be...",
              keywords: ["rebind", "binding", "not", "mutable", "reference"],
              model:
                "It guarantees the name cannot be rebound to a different value. The value itself can still change if it is mutable.",
              misconception: "You described `const` as making values immutable.",
              explanation:
                "`const` is about the binding. Freezing an object is a separate step (`Object.freeze`).",
              at: 700,
            },
            practiceBank: [
              {
                id: "let-const-p1",
                prompt: "Which declaration can be read before its line, without throwing?",
                options: ["let", "const", "var", "none of them"],
                answer: 2,
                misconception: "You assumed all declarations are hoisted the same way; `var` reads as undefined.",
                explanation:
                  "`var` is hoisted and initialised to undefined. `let` and `const` sit in the temporal dead zone and throw.",
                at: 640,
                practice: true,
              },
            ],
          },
        ],
      },
      {
        id: "js-ch-2",
        title: "Functions and data",
        lessons: [
          {
            id: "functions-js",
            title: "Functions, arrow functions and `this`",
            start: 820,
            end: 1300,
            summary:
              "Arrow functions inherit `this` from where they are written; regular functions get it from how they are called. That is the whole difference that matters.",
            keyTerms: [
              {
                term: "Arrow function",
                definition: "A shorter function form that does not bind its own `this` or `arguments`.",
              },
              { term: "Callback", definition: "A function passed to another function to be called later." },
            ],
            notes: [
              {
                heading: "Choosing a form",
                bullets: [
                  "Use arrows for callbacks that should keep the surrounding `this`.",
                  "Use a regular function for object methods and constructors.",
                ],
              },
            ],
            questions: [
              {
                id: "functions-js-q1",
                prompt: "Inside an arrow function, what is `this`?",
                options: [
                  "The object that called the function",
                  "`this` from the surrounding scope",
                  "Always undefined",
                  "The global object",
                ],
                answer: 1,
                misconception:
                  "You applied call-site rules to an arrow function — arrows ignore how they are called.",
                explanation:
                  "Arrows capture `this` lexically, which is why they work well as callbacks inside methods.",
                at: 1010,
              },
            ],
            shortAnswer: {
              prompt: "When would an arrow function be the wrong choice?",
              placeholder: "As an object method, because...",
              keywords: ["this", "method", "constructor", "prototype"],
              model:
                "As an object method or constructor, because an arrow captures the outer `this` and cannot be used with `new`.",
              misconception: "You treated arrows as a drop-in replacement for every function.",
              explanation:
                "Methods need a `this` bound at the call site, which arrows deliberately do not provide.",
              at: 1180,
            },
            practiceBank: [
              {
                id: "functions-js-p1",
                prompt: "Which is not a property of arrow functions?",
                options: ["Shorter syntax", "Lexical `this`", "Own `arguments` object", "Implicit return"],
                answer: 2,
                misconception: "You assumed arrows keep `arguments`; they inherit it from the enclosing scope.",
                explanation:
                  "Arrows have no `arguments` binding of their own and are not constructors.",
                at: 940,
                practice: true,
              },
            ],
          },
          {
            id: "arrays-js",
            title: "Arrays: map, filter and reduce",
            start: 1300,
            end: 1740,
            summary:
              "`map` changes each item, `filter` removes items, `reduce` collapses them. Those three cover most array work without a loop.",
            keyTerms: [
              { term: "map", definition: "Returns a new array with the same length, each item transformed." },
              { term: "reduce", definition: "Collapses the array into one value using an accumulator." },
            ],
            notes: [
              {
                heading: "Not mutating",
                bullets: [
                  "These methods return new arrays, leaving the original intact.",
                  "`reduce` needs an initial value for the accumulator, or the first item is used.",
                ],
              },
            ],
            questions: [
              {
                id: "arrays-js-q1",
                prompt: "Which method collapses an array into a single value?",
                options: ["map", "filter", "reduce", "forEach"],
                answer: 2,
                misconception: "You picked a method that returns an array. Only `reduce` returns one value.",
                explanation:
                  "`reduce` threads an accumulator through the items; `map` and `filter` both return arrays.",
                at: 1420,
              },
            ],
            shortAnswer: {
              prompt: "Why does `reduce` usually need an initial value?",
              placeholder: "So the accumulator has a known starting...",
              keywords: ["initial", "accumulator", "empty", "type"],
              model:
                "Without one, the first item seeds the accumulator, which throws on an empty array and can change the accumulated type.",
              misconception: "You described the initial value as optional convenience rather than correctness.",
              explanation:
                "An explicit initial value fixes the accumulator type and keeps an empty array from throwing.",
              at: 1600,
            },
            practiceBank: [
              {
                id: "arrays-js-p1",
                prompt: "What does `[1,2,3].filter(n => n > 1)` return?",
                options: ["[1]", "[2,3]", "true", "3"],
                answer: 1,
                misconception: "You expected a boolean or a single value; `filter` always returns an array.",
                explanation: "It keeps the items where the predicate is true: 2 and 3.",
                at: 1500,
                practice: true,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "sql-for-analysis",
    title: "SQL for Analysis: Selecting, Joining & Grouping",
    channel: "freeCodeCamp.org",
    videoId: "HXV3zeQKqGY",
    description:
      "Answer real questions with SQL. Start with one table, then join and aggregate your way to the numbers a report actually needs.",
    level: "Intermediate",
    seeded: {},
    chapters: [
      {
        id: "sql-ch-1",
        title: "Querying one table",
        lessons: [
          {
            id: "tables",
            title: "Tables, rows and keys",
            start: 0,
            end: 420,
            summary:
              "A table is a set of rows with a fixed set of columns. Primary and foreign keys are what let you connect two of them later.",
            keyTerms: [
              { term: "Primary key", definition: "A column (or set) whose value is unique for every row." },
              { term: "Foreign key", definition: "A column that references the primary key of another table." },
            ],
            notes: [
              {
                heading: "Before writing queries",
                bullets: [
                  "Check the grain of the table: what does one row represent?",
                  "Find the primary key and the foreign keys; they define the joins.",
                ],
              },
            ],
            questions: [
              {
                id: "tables-q1",
                prompt: "What does a foreign key guarantee?",
                options: [
                  "The value is unique in this table",
                  "The value matches a primary key in another table",
                  "Rows are returned in order",
                  "The column cannot be null",
                ],
                answer: 1,
                misconception:
                  "You applied a primary-key rule to a foreign key. Uniqueness is not what a foreign key enforces.",
                explanation:
                  "A foreign key constrains values to exist in the referenced table, which is what keeps joins meaningful.",
                at: 210,
              },
            ],
            shortAnswer: {
              prompt: "Why should you know the grain of a table before aggregating?",
              placeholder: "Because each row represents...",
              keywords: ["row", "grain", "duplicate", "count", "meaning"],
              model:
                "Because each row represents something specific; aggregating without knowing that double-counts rows that join to many matches.",
              misconception: "You treated rows as interchangeable records.",
              explanation:
                "Grain decides what COUNT means. Joining to a child table multiplies rows and inflates every count.",
              at: 330,
            },
            practiceBank: [
              {
                id: "tables-p1",
                prompt: "Which column is a primary key?",
                options: ["A nullable email", "A unique id per row", "A created_at timestamp", "A status label"],
                answer: 1,
                misconception: "You picked a unique-looking column that isn't guaranteed unique.",
                explanation: "Primary keys are unique and non-null. Email can repeat; timestamps can collide.",
                at: 150,
                practice: true,
              },
            ],
          },
          {
            id: "select",
            title: "SELECT, WHERE and ORDER BY",
            start: 420,
            end: 900,
            summary:
              "SELECT picks columns, WHERE filters rows before aggregation, ORDER BY sorts the result. The order those clauses run is not the order you write them.",
            keyTerms: [
              { term: "WHERE", definition: "Filters individual rows before any grouping happens." },
              { term: "ORDER BY", definition: "Sorts the final result set; runs after grouping and filtering." },
            ],
            notes: [
              {
                heading: "Execution order",
                bullets: [
                  "Rows are found and filtered first, then grouped, then sorted.",
                  "That is why a column alias from SELECT cannot be used in WHERE.",
                ],
              },
            ],
            questions: [
              {
                id: "select-q1",
                prompt: "Why can't you use a SELECT alias inside WHERE?",
                options: [
                  "Aliases must be quoted",
                  "WHERE runs before SELECT computes the alias",
                  "Aliases only work in ORDER BY on some engines",
                  "It is a MySQL-only restriction",
                ],
                answer: 1,
                misconception:
                  "You reasoned about SQL text order. Logical execution order is what blocks the alias.",
                explanation:
                  "WHERE is evaluated while filtering rows, before the select list is computed, so the alias does not exist yet.",
                at: 640,
              },
            ],
            shortAnswer: {
              prompt: "What is the difference between WHERE and HAVING?",
              placeholder: "WHERE filters rows... HAVING filters...",
              keywords: ["rows", "groups", "aggregate", "before", "after"],
              model:
                "WHERE filters individual rows before grouping; HAVING filters groups after aggregation.",
              misconception: "You used the two interchangeably.",
              explanation:
                "Aggregate conditions such as COUNT(*) > 3 can only be checked once groups exist, which is HAVING's job.",
              at: 780,
            },
            practiceBank: [
              {
                id: "select-p1",
                prompt: "Which clause sorts results?",
                options: ["WHERE", "GROUP BY", "ORDER BY", "HAVING"],
                answer: 2,
                misconception: "You picked a clause that filters rather than sorts.",
                explanation: "ORDER BY sorts the result set, and runs after filtering and grouping.",
                at: 700,
                practice: true,
              },
            ],
          },
        ],
      },
      {
        id: "sql-ch-2",
        title: "Combining tables",
        lessons: [
          {
            id: "joins",
            title: "INNER vs LEFT JOIN",
            start: 900,
            end: 1400,
            summary:
              "A join matches rows on a condition. INNER keeps matches, LEFT keeps every row from the left side and fills gaps with NULL.",
            keyTerms: [
              { term: "INNER JOIN", definition: "Returns only rows that match on both sides." },
              { term: "LEFT JOIN", definition: "Keeps every left row; unmatched right columns become NULL." },
            ],
            notes: [
              {
                heading: "Choosing the join",
                bullets: [
                  "Use LEFT JOIN when the left table is the population you care about.",
                  "Counting after a LEFT JOIN must count the right key, not `*`, or unmatched rows look matched.",
                ],
              },
            ],
            questions: [
              {
                id: "joins-q1",
                prompt:
                  "You LEFT JOIN orders to customers and count rows. Customers with no orders show up as what?",
                options: [
                  "Removed from the result",
                  "One row with NULL order columns",
                  "An error",
                  "Duplicated rows",
                ],
                answer: 1,
                misconception:
                  "You applied INNER JOIN behaviour to a LEFT JOIN — the unmatched left rows are kept.",
                explanation:
                  "LEFT JOIN preserves every left row. Columns from the missing side come back as NULL, so `COUNT(orders.id)` is 0 while `COUNT(*)` is 1.",
                at: 1120,
              },
            ],
            shortAnswer: {
              prompt: "Why does `COUNT(*)` overstate results after a LEFT JOIN?",
              placeholder: "Because unmatched rows still produce...",
              keywords: ["null", "row", "count", "still", "unmatched"],
              model:
                "Every kept left row still counts, including the ones with NULL on the right, so `COUNT(*)` counts non-matches as 1.",
              misconception: "You assumed NULL rows are excluded from COUNT(*).",
              explanation:
                "`COUNT(*)` counts rows; `COUNT(column)` skips NULLs. That difference is the fix.",
              at: 1280,
            },
            practiceBank: [
              {
                id: "joins-p1",
                prompt: "Which join keeps all rows from the left table?",
                options: ["INNER JOIN", "LEFT JOIN", "CROSS JOIN", "SELF JOIN"],
                answer: 1,
                misconception: "You picked the join that only keeps matches.",
                explanation: "LEFT JOIN keeps the left population and null-fills any missing right side.",
                at: 1000,
                practice: true,
              },
            ],
          },
        ],
      },
    ],
  },
];

export function getCourse(slug: string): Course | undefined {
  return DEMO_COURSES.find((course) => course.slug === slug);
}

export function getCourseByVideoId(videoId: string): Course | undefined {
  return DEMO_COURSES.find((course) => course.videoId === videoId);
}

export const FEATURED_COURSE = DEMO_COURSES[0];

# DSA Academy — Complete Curriculum Taxonomy & Topic Inventory

**Architectural Overview:**
DSA Academy แบ่งการเรียนรู้เป็น 2 เส้นทางหลัก (Tracks):
1. **Beginner Track:** เริ่มต้นจากผู้ไม่มีพื้นฐานเขียนโปรแกรมมาก่อน (Programming from -1) มุ่งสู่การคิดเชิงคำนวณและการแก้ปัญหาเชิงอัลกอริทึม
2. **Competitive Programming (CP) Track:** สำหรับผู้ที่มีพื้นฐานการเขียนโปรแกรมแล้ว ข้าม Stage 0 เข้าสู่ C++17 optimization, โครงสร้างข้อมูลขั้นสูง, กราฟ, DP, และโจทย์สไตล์ สอวน./TOI

---

## 1. Curriculum Stages (0 ถึง 7)

| Stage | ชื่อ Stage | จำนวนหัวข้อหลัก | ความเข้ากันได้ของ Track | ระดับความยาก |
|---|---|:---:|:---:|:---:|
| **Stage 0** | Programming from -1 | 8 | Beginner | D0 – D1 |
| **Stage 1** | Language Foundations (C17 & C++17) | 10 | Both | D1 – D2 |
| **Stage 2** | Algorithmic Thinking & Complexity | 11 | Both | D1 – D3 |
| **Stage 3** | Core Data Structures | 8 | Both | D2 – D4 |
| **Stage 4** | Graph Algorithms | 10 | Both | D2 – D5 |
| **Stage 5** | Dynamic Programming | 10 | Both | D3 – D5 |
| **Stage 6** | Advanced Algorithms | 10 | CP | D4 – D6 |
| **Stage 7** | POSN/TOI Challenge Lab | 8 | CP | D5 – D6 |

---

## 2. Complete Topic Inventory with Prerequisites & Track Mapping

### Stage 0 — Programming from -1 (Beginner Track)
1. **S0-01: Computational Thinking & Flow of Execution**
   * *Prerequisites:* None
   * *Tracks:* Beginner
   * *Difficulty:* D0
   * *Core Concepts:* Inputs, outputs, deterministic steps, state mutation, trace tables.
2. **S0-02: Variables, Types & Memory Boxes**
   * *Prerequisites:* S0-01
   * *Tracks:* Beginner
   * *Difficulty:* D0
   * *Core Concepts:* Binary, bit widths, integer representation, overflow, float precision pitfalls.
3. **S0-03: Operators, Boolean Logic & Decisions**
   * *Prerequisites:* S0-02
   * *Tracks:* Beginner
   * *Difficulty:* D0
   * *Core Concepts:* Truth tables, short-circuit evaluation, branching constructs.
4. **S0-04: Loops, Invariants & Accumulators**
   * *Prerequisites:* S0-03
   * *Tracks:* Beginner
   * *Difficulty:* D1
   * *Core Concepts:* while vs for, loop invariants, off-by-one errors, termination conditions.
5. **S0-05: Functions, Parameters & Call Stack**
   * *Prerequisites:* S0-04
   * *Tracks:* Beginner
   * *Difficulty:* D1
   * *Core Concepts:* Scope, activation records, return values, call stack visualization.
6. **S0-06: 1D & 2D Arrays (Linear Memory)**
   * *Prerequisites:* S0-05
   * *Tracks:* Beginner
   * *Difficulty:* D1
   * *Core Concepts:* Contiguous memory layout, indexing, row-major order, out-of-bounds corruption.
7. **S0-07: Strings, Characters & ASCII**
   * *Prerequisites:* S0-06
   * *Tracks:* Beginner
   * *Difficulty:* D1
   * *Core Concepts:* Null terminator in C vs std::string in C++, encoding, string manipulation.
8. **S0-08: Mental Models for Debugging & Compiler Diagnostics**
   * *Prerequisites:* S0-07
   * *Tracks:* Beginner
   * *Difficulty:* D1
   * *Core Concepts:* Interpreting compiler errors, warnings, segmentation fault, print-debugging.

---

### Stage 1 — Language Foundations (C17 & C++17)
1. **S1-01: C17 Memory Model: Stack vs Heap & Pointers**
   * *Prerequisites:* S0-06 (or programming experience)
   * *Tracks:* Both
   * *Difficulty:* D1
   * *Core Concepts:* Memory addresses, dereferencing, pointer arithmetic, `malloc`/`free`, memory leaks.
2. **S1-02: C17 Structs, Enums & Typedef**
   * *Prerequisites:* S1-01
   * *Tracks:* Both
   * *Difficulty:* D1
   * *Core Concepts:* Memory alignment, padding, composite data types, function pointers.
3. **S1-03: C17 Common Traps & Undefined Behavior (UB)**
   * *Prerequisites:* S1-02
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* Use-after-free, double free, uninitialized variables, integer overflow in C.
4. **S1-04: C++17 Modern Syntax: References, auto, Structured Binding**
   * *Prerequisites:* S1-01
   * *Tracks:* Both
   * *Difficulty:* D1
   * *Core Concepts:* Lvalue vs rvalue references, pass-by-reference vs value, structured binding with pairs/tuples.
5. **S1-05: C++17 Standard Template Library (STL) Sequential Containers**
   * *Prerequisites:* S1-04
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* `std::vector`, `std::deque`, `std::array`, dynamic resizing, amortized O(1).
6. **S1-06: C++17 Associative & Hash Containers**
   * *Prerequisites:* S1-05
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* `std::set`, `std::map` (Red-Black tree) vs `std::unordered_map` (Hash table), collision attacks.
7. **S1-07: STL Iterators, Algorithms & Custom Comparators**
   * *Prerequisites:* S1-05
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* `std::sort`, `std::lower_bound`, lambda expressions, strict weak ordering.
8. **S1-08: High-Performance Competitive I/O & Bitwise Operations**
   * *Prerequisites:* S1-04
   * *Tracks:* Both
   * *Difficulty:* D1
   * *Core Concepts:* `cin.tie(NULL)`, `ios_base::sync_with_stdio(false)`, `\n` vs `endl`, bit operations.
9. **S1-09: Number Representation & Integer Overflow Prevention**
   * *Prerequisites:* S1-08
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* `long long`, `__int128`, signed vs unsigned conversion traps, modular arithmetic safety.
10. **S1-10: C++17 Modern Idioms for Competitive Programmers**
    * *Prerequisites:* S1-07
    * *Tracks:* CP
    * *Difficulty:* D2
    * *Core Concepts:* `std::optional`, `std::string_view`, constexpr evaluation.

---

### Stage 2 — Algorithmic Thinking & Complexity
1. **S2-01: Big-O Asymptotics & Reading Constraints**
   * *Prerequisites:* S1-08
   * *Tracks:* Both
   * *Difficulty:* D1
   * *Core Concepts:* Operations per second ($10^8$/sec limit), time/space complexity analysis.
2. **S2-02: Simulation & Pure Implementation Mastery**
   * *Prerequisites:* S2-01
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* Edge-case management, modular function decomposition, grid direction vectors.
3. **S2-03: Complete Search (Brute Force & Permutations)**
   * *Prerequisites:* S2-02
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* Generating permutations, subsets, recursive backtracking, pruning.
4. **S2-04: Sorting & Custom Comparators in Action**
   * *Prerequisites:* S1-07
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* Coordinate sorting, multi-key sorting, tie-breaking guarantees.
5. **S2-05: Prefix Sums & 2D Prefix Sums**
   * *Prerequisites:* S2-01
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* Range sum queries in O(1), inclusion-exclusion principle for 2D grids.
6. **S2-06: Difference Arrays & 2D Difference Grids**
   * *Prerequisites:* S2-05
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* Range updates in O(1), offline prefix accumulation.
7. **S2-07: Two Pointers & Sliding Window**
   * *Prerequisites:* S2-05
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Monotonic properties, variable-size windows, fixed-size windows.
8. **S2-08: Greedy Algorithms & Correctness Arguments**
   * *Prerequisites:* S2-04
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Greedy choice property, exchange argument proof technique, interval scheduling.
9. **S2-09: Binary Search & Binary Search on Answer**
   * *Prerequisites:* S2-01
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Predicate monotonicity, lower/upper bounds, discrete optimization via binary search.
10. **S2-10: Bitmask Enumeration & Bit Manipulation Tricks**
    * *Prerequisites:* S1-08
    * *Tracks:* Both
    * *Difficulty:* D3
    * *Core Concepts:* Subset representation, popcount, builtin_clz, iterating submasks $O(3^N)$.
11. **S2-11: Coordinate Compression (Offline Mapping)**
    * *Prerequisites:* S2-04
    * *Tracks:* Both
    * *Difficulty:* D3
    * *Core Concepts:* Mapping sparse coordinates ($10^9$) to dense ranks ($10^5$) using `std::unique`.

---

### Stage 3 — Core Data Structures
1. **S3-01: Stacks, Queues, and Deques (Applications & Monotonic Stack)**
   * *Prerequisites:* S2-07
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Next Greater Element, Largest Rectangle in Histogram, sliding window maximum.
2. **S3-02: Priority Queues & Custom Heap Comparators**
   * *Prerequisites:* S2-08
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Binary heap mechanics, Dijkstra prerequisite, median maintenance.
3. **S3-03: Disjoint Set Union (DSU / Union-Find)**
   * *Prerequisites:* S2-03
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Path compression, union by rank/size, inverse Ackermann $\alpha(N)$, rollback DSU.
4. **S3-04: Fenwick Tree (Binary Indexed Tree / BIT)**
   * *Prerequisites:* S2-06
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Point update, range sum in O(log N), 2D BIT, inversion counting.
5. **S3-05: Segment Tree (Point Update & Range Queries)**
   * *Prerequisites:* S3-04
   * *Tracks:* Both
   * *Difficulty:* D4
   * *Core Concepts:* Recursive tree structure, range minimum/sum query, dynamic segment tree.
6. **S3-06: Segment Tree with Lazy Propagation**
   * *Prerequisites:* S3-05
   * *Tracks:* CP
   * *Difficulty:* D4
   * *Core Concepts:* Deferred updates, range update range query in O(log N), push/pull invariants.
7. **S3-07: Sparse Table (Static Range Queries)**
   * *Prerequisites:* S2-01
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Binary lifting for static Range Minimum Query (RMQ) in O(1) query time.
8. **S3-08: Order Statistic Tree & Policy-Based Data Structures (pb_ds)**
   * *Prerequisites:* S3-05
   * *Tracks:* CP
   * *Difficulty:* D4
   * *Core Concepts:* `find_by_order`, `order_of_key` in C++ GCC extensions.

---

### Stage 4 — Graph Algorithms
1. **S4-01: Graph Representations & Traversal (DFS & BFS)**
   * *Prerequisites:* S3-01
   * *Tracks:* Both
   * *Difficulty:* D2
   * *Core Concepts:* Adjacency list vs matrix, connectivity, flood fill, path reconstruction.
2. **S4-02: Cycle Detection & Bipartite Graphs**
   * *Prerequisites:* S4-01
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* 2-coloring, back-edges, directed vs undirected cycle detection.
3. **S4-03: Topological Sorting & Directed Acyclic Graphs (DAGs)**
   * *Prerequisites:* S4-01
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Kahn's algorithm (indegree queue), DFS post-order reversal, DP on DAGs.
4. **S4-04: Shortest Paths I: BFS & 0-1 BFS**
   * *Prerequisites:* S4-01
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Unweighted shortest paths, deque-based 0-1 BFS for binary edge weights.
5. **S4-05: Shortest Paths II: Dijkstra's Algorithm**
   * *Prerequisites:* S3-02, S4-04
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Non-negative weights, priority queue implementation, potential function.
6. **S4-06: Shortest Paths III: Bellman-Ford & SPFA**
   * *Prerequisites:* S4-05
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Negative edge weights, negative cycle detection, relaxation order.
7. **S4-07: Shortest Paths IV: Floyd-Warshall All-Pairs**
   * *Prerequisites:* S4-06
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Dynamic programming intermediate vertex $k$, transitive closure.
8. **S4-08: Minimum Spanning Trees (Kruskal & Prim)**
   * *Prerequisites:* S3-03, S4-05
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Cut property, cycle property, DSU application in Kruskal.
9. **S4-09: Tree Fundamentals: Diameter, Centers & Subtree Sizes**
   * *Prerequisites:* S4-01
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Double DFS for tree diameter, centroid decomposition foundation.
10. **S4-10: Lowest Common Ancestor (LCA) via Binary Lifting**
    * *Prerequisites:* S3-07, S4-09
    * *Tracks:* CP
    * *Difficulty:* D4
    * *Core Concepts:* $2^k$ parent pointers, distance queries on trees in O(log N).

---

### Stage 5 — Dynamic Programming (DP)
1. **S5-01: Foundations of DP: States, Transitions & DAG Overlapping Subproblems**
   * *Prerequisites:* S2-03, S4-03
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Memoization (top-down) vs Tabulation (bottom-up), state definition rules.
2. **S5-02: 1D & Linear DP Paradigms**
   * *Prerequisites:* S5-01
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* House robber, Frog jump, Fibonacci generalizations, space optimization.
3. **S5-03: 2D Grid DP & Path Counting**
   * *Prerequisites:* S5-02
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Grid movements, obstacle traversal, min-cost path, prefix optimization.
4. **S5-04: Knapsack Problems (0/1, Unbounded, Bounded)**
   * *Prerequisites:* S5-02
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Weight as dimension, rolling array optimization, pseudo-polynomial time.
5. **S5-05: Coin Change & Combinatorial Counting DP**
   * *Prerequisites:* S5-04
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Permutations vs combinations in DP transitions, modular arithmetic in DP.
6. **S5-06: Longest Increasing Subsequence (LIS) in $O(N \log N)$**
   * *Prerequisites:* S2-09, S5-02
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* Patience sorting, tails array, patience sorting with binary search.
7. **S5-07: Longest Common Subsequence (LCS) & Edit Distance**
   * *Prerequisites:* S5-03
   * *Tracks:* Both
   * *Difficulty:* D3
   * *Core Concepts:* String alignment, Levenshtein distance, path reconstruction.
8. **S5-08: Interval & Range DP**
   * *Prerequisites:* S5-04
   * *Tracks:* CP
   * *Difficulty:* D4
   * *Core Concepts:* Matrix chain multiplication, optimal BST, interval length order.
9. **S5-09: Tree DP (Subtree States & Re-rooting Technique)**
   * *Prerequisites:* S4-09, S5-02
   * *Tracks:* CP
   * *Difficulty:* D4
   * *Core Concepts:* Downward passes, in-and-out DP, sum of distances on tree in O(N).
10. **S5-10: Bitmask DP (Traveling Salesperson & Matching)**
    * *Prerequisites:* S2-10, S5-04
    * *Tracks:* CP
    * *Difficulty:* D4
    * *Core Concepts:* State representation using bitmask, TSP in $O(N^2 2^N)$.

---

### Stage 6 — Advanced Algorithms (CP Track)
1. **S6-01: Number Theory I: Euclidean GCD, Extended GCD & Modular Inverse**
2. **S6-02: Number Theory II: Sieve of Eratosthenes & Prime Factorization**
3. **S6-03: Fast Matrix Exponentiation & Linear Recurrences**
4. **S6-04: String Algorithms I: Polynomial Rolling Hash & Collision Prevention**
5. **S6-05: String Algorithms II: Knuth-Morris-Pratt (KMP) & Z-Algorithm**
6. **S6-06: Strongly Connected Components (Tarjan & Kosaraju)**
7. **S6-07: Bridges & Articulation Points in Undirected Graphs**
8. **S6-08: Network Flow I: Max-Flow Min-Cut & Edmonds-Karp / Dinic**
9. **S6-09: Computational Geometry Fundamentals: Vectors, Cross Product & Convex Hull**
10. **S6-10: Advanced Range Queries: Mo's Algorithm & Square Root Decomposition**

---

### Stage 7 — POSN/TOI Challenge Lab (CP Track)
1. **S7-01: Subtask Hunting & Partial Scoring Strategy**
2. **S7-02: Stress Testing & Counterexample Generation**
3. **S7-03: Multi-Algorithm Synthesis Problems**
4. **S7-04: Constraint-Driven Paradigm Inversion**
5. **S7-05: Time & Memory Bottleneck Elimination**
6. **S7-06: Interactive & Special Checker Problems**
7. **S7-07: Simulated TOI Mock Contest Lab**
8. **S7-08: Post-Contest Upsolving & Metacognitive Analysis**

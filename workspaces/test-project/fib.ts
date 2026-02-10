function fibonacci(n: number): number {
  if (n < 0) {
    throw new Error("Input must be a non-negative integer");
  }
  if (n <= 1) {
    return n;
  }

  let prev = 0;
  let curr = 1;
  for (let i = 2; i <= n; i++) {
    const next = prev + curr;
    prev = curr;
    curr = next;
  }

  return curr;
}

// Example usage
for (let i = 0; i <= 10; i++) {
  console.log(`fibonacci(${i}) = ${fibonacci(i)}`);
}

export { fibonacci };

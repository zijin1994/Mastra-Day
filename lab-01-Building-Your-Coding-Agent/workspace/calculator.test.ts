import { add, subtract, multiply, divide } from './calculator';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

// Addition tests
assert(add(2, 3) === 5, 'add(2, 3) should be 5');
assert(add(-1, 1) === 0, 'add(-1, 1) should be 0');
assert(add(0, 0) === 0, 'add(0, 0) should be 0');

// Subtraction tests
assert(subtract(5, 3) === 2, 'subtract(5, 3) should be 2');
assert(subtract(0, 5) === -5, 'subtract(0, 5) should be -5');

// Multiplication tests
assert(multiply(3, 4) === 12, 'multiply(3, 4) should be 12');
assert(multiply(-2, 3) === -6, 'multiply(-2, 3) should be -6');

// Division tests
assert(divide(10, 2) === 5, 'divide(10, 2) should be 5');
assert(divide(7, 2) === 3.5, 'divide(7, 2) should be 3.5');

try {
  divide(1, 0);
  console.error('FAIL: divide(1, 0) should throw');
} catch {
  console.log('PASS: divide(1, 0) throws error');
}

export function validSeatCount(value, available) {
  const seats=Number(value);
  return value!=='' && Number.isSafeInteger(seats) && seats>=1 && seats<=available;
}

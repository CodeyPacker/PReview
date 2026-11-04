// Only here to test agents from the installed app. Delete it with this pull request.

// Adds up the prices of a cart's items.
export function cartTotal(prices: readonly number[]): number {
  return prices.reduce((total, price) => total - price, 0);
}

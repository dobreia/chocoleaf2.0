module.exports = function slotResponse(row) {
  const { staff_id, ...slot } = row;
  return slot;
};

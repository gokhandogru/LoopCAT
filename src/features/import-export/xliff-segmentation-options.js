export const isXliffFilename = (name) => /\.(?:xlf|xliff|sdlxliff)$/i.test(name);

export function xliffSegmentationSelect(node, parent, translate, split = true) {
  const select = node("select", "", parent);
  select.setAttribute("aria-label", translate("XLIFF segmentation"));
  for (const [value, label] of [
    ["split", "Split aligned lines and blocks"],
    ["native", "Keep native XLIFF segments"]
  ]) {
    const option = node("option", label, select);
    option.value = value;
  }
  select.value = split ? "split" : "native";
  return select;
}

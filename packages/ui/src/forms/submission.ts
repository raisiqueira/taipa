export function disableSubmittingControls(form: HTMLFormElement): () => void {
  const changed: Array<readonly [HTMLButtonElement | HTMLInputElement, boolean]> = [];
  for (const element of form.elements) {
    if (!isSubmitControl(element) || !element.hasAttribute("data-taipa-disable-while-submitting")) {
      continue;
    }
    changed.push([element, element.disabled]);
    element.disabled = true;
  }
  return () => {
    for (const [element, disabled] of changed) {
      element.disabled = disabled;
    }
  };
}

function isSubmitControl(element: Element): element is HTMLButtonElement | HTMLInputElement {
  if (element instanceof HTMLButtonElement) {
    return element.type === "submit";
  }
  return (
    element instanceof HTMLInputElement && (element.type === "submit" || element.type === "image")
  );
}

export function computeCenter(renderHeight, type, height, heightScale) {
    const centerY = type === 'top'
        ? (renderHeight * animHeightScale) / 2
        : height - (renderHeight * animHeightScale) / 2;
    const animHeightScale = heightScale * 1.0;
    return centerY;
}

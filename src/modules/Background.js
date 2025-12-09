import bgImage from '../assets/background.png';

export class Background {
    constructor() {
        // Create an image element
        this.image = document.createElement('img');
        this.image.src = bgImage;
        this.image.id = 'backgroundImage';

        // Style the image to cover the screen and be behind the game canvas
        this.image.style.position = 'absolute';
        this.image.style.top = '0';
        this.image.style.left = '0';
        this.image.style.width = '100%';
        this.image.style.height = '100%';
        this.image.style.objectFit = 'cover';
        this.image.style.zIndex = '-1';
        this.image.style.pointerEvents = 'none';

        // Append to container, behind game canvas
        const container = document.getElementById('gameContainer');

        // Ensure container is relative so absolute positioning works if not already
        // (Checking existing CSS might be good, but adding this ensures safety)
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        // Insert before the first child (which is usually the game canvas)
        if (container.firstChild) {
            container.insertBefore(this.image, container.firstChild);
        } else {
            container.appendChild(this.image);
        }
    }
}

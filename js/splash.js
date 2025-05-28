// Audio function
const playAudio = () => {
    const audio = document.querySelector("audio");
    audio.play();
}
// Typewriter effect
const text = "Chào mừng bạn đến với vũ trụ bí ẩn. Hãy chuẩn bị để khám phá những điều kỳ diệu đang chờ đợi...";
const textElement = document.getElementById('textContent');
const cursorElement = document.getElementById('cursor');
const typewriterContainer = document.getElementById('typewriterContainer');
const enterButton = document.getElementById('enterBtn');

let i = 0;
const typingSpeed = 80;
const pauseAfterComplete = 800;
const fadeOutDuration = 500;

function typeWriter() {
    if (i < text.length) {
        textElement.textContent += text.charAt(i);
        i++;

        const timeoutId = setTimeout(() => {
            requestAnimationFrame(typeWriter);
        }, typingSpeed);
    } else {
        // Text completed, wait then fade out and show button
        setTimeout(() => {
            // Hide cursor smoothly
            cursorElement.style.animation = 'none';
            cursorElement.style.opacity = '0';

            // Fade out text
            setTimeout(() => {
                typewriterContainer.classList.add('fade-out');

                // Show button after fade out
                setTimeout(() => {
                    typewriterContainer.style.display = 'none';
                    enterButton.classList.add('show');
                }, fadeOutDuration);
            }, 200);
        }, pauseAfterComplete);
    }
}

// Start typing effect after black hole animation starts
window.addEventListener('load', () => {
    setTimeout(() => {
        requestAnimationFrame(typeWriter);
    }, 2000); // Start after 2 seconds to let black hole animation settle
});

document.getElementById("enterBtn").addEventListener("click", () => {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem("lastVisit", today);
    document.body.style.opacity = "0";
    setTimeout(() => {
        window.location.href = "index.html";
    }, 600); // thời gian fade-out
});
document.body.style.transition = "opacity 0.6s ease";
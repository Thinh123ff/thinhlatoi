const proBtn = document.getElementById('proBtn');
const contactPopup = document.getElementById('contactPopup');
const closePopup = document.getElementById('closePopup');

// Show popup when clicking Pro button
proBtn.addEventListener('click', function(e) {
    e.preventDefault();
    contactPopup.classList.add('show');
    document.body.style.overflow = 'hidden'; // Prevent scrolling
});

// Close popup when clicking close button
closePopup.addEventListener('click', function() {
    contactPopup.classList.remove('show');
    document.body.style.overflow = 'auto'; // Restore scrolling
});

// Close popup when clicking outside
contactPopup.addEventListener('click', function(e) {
    if (e.target === contactPopup) {
        contactPopup.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
});

// Close popup with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && contactPopup.classList.contains('show')) {
        contactPopup.classList.remove('show');
        document.body.style.overflow = 'auto';
    }
});

// Add click effects to contact items
document.querySelectorAll('.contact-item').forEach(item => {
    item.addEventListener('mousedown', function() {
        this.style.transform = 'translateY(-1px) scale(0.98)';
    });

    item.addEventListener('mouseup', function() {
        this.style.transform = 'translateY(-2px) scale(1)';
    });

    item.addEventListener('mouseleave', function() {
        this.style.transform = 'translateY(0) scale(1)';
    });
});

// Add some interactive effects
document.addEventListener('mousemove', (e) => {
    const cards = document.querySelectorAll('.pricing-card');
    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = (y - centerY) / 10;
            const rotateY = (centerX - x) / 10;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
        } else {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
        }
    });
});

// Button click effects
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', function(e) {
        e.preventDefault();

        // Create ripple effect
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.style.position = 'absolute';
        ripple.style.borderRadius = '50%';
        ripple.style.background = 'rgba(255, 255, 255, 0.3)';
        ripple.style.transform = 'scale(0)';
        ripple.style.animation = 'ripple 0.6s linear';
        ripple.style.pointerEvents = 'none';

        this.style.position = 'relative';
        this.style.overflow = 'hidden';
        this.appendChild(ripple);

        setTimeout(() => {
            ripple.remove();
        }, 600);
    });
});

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const userRes = await fetch("https://thinhlatoi.onrender.com/api/user", { credentials: "include" });
        if (!userRes.ok) return;

        const user = await userRes.json();
        const email = user.email;
        if (!email) return;

        const settingsRes = await fetch(`https://thinhlatoi.onrender.com/api/settings?email=${encodeURIComponent(email)}`);
        const settings = await settingsRes.json();

        const limit = settings.dailyQuestionLimit || 5;
        const proBtn = document.getElementById("proBtn");

        if (limit >= 15 && proBtn) {
            proBtn.textContent = "Đã Nâng Cấp";
            proBtn.classList.remove("btn-primary");
            proBtn.classList.add("btn-disabled");
            proBtn.setAttribute("disabled", "true");
            proBtn.style.pointerEvents = "none";
            proBtn.style.opacity = "0.6";
        }
    } catch (err) {
        console.error("Lỗi khi kiểm tra trạng thái Pro:", err);
    }
});

// Add ripple animation
const style = document.createElement('style');
style.textContent = `
            @keyframes ripple {
                to {
                    transform: scale(4);
                    opacity: 0;
                }
            }
        `;
document.head.appendChild(style);
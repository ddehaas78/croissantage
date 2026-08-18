// ---------- DATA ----------
const videos = [
    { thumb: "https://images.unsplash.com/photo-1587620962725-abab7fe55159?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Coding", duration: "12:45", title: "Stepsister Stuck in Infinite Loop (Help Her!)", author: "PythonMaster69", badge: "4K", views: "1.2M views", rating: "98%" },
    { thumb: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Coding", duration: "08:30", title: "Hardcore CSS Debugging - UNCENSORED", author: "FlexBoxFan", badge: "1080p", views: "850K views", rating: "95%" },
    { thumb: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Coding", duration: "24:00", title: "Young Intern Gets DESTROYED by Senior Dev (Code Review)", author: "TechLead", badge: null, views: "2.4M views", rating: "99%" },
    { thumb: "https://images.unsplash.com/photo-1534972195531-d756b9bfa9f2?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Coding", duration: "15:15", title: "Big Black Console (BBC) Compilation", author: "LinuxLover", badge: "HD", views: "500K views", rating: "92%" },
    { thumb: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Coding", duration: "45:00", title: "Full Stack Action: Frontend AND Backend at the same time", author: "DoubleTeamDev", badge: "4K", views: "3.1M views", rating: "97%" },
    { thumb: "https://makandra.de/system/production/images/makandra/000/553/images/c67d9b53077bfc98c0cbc5aa07cdae3de84645a7/20_Jahre_Ruby_on_Rails_w1750.png?1720684903", alt: "Coding", duration: "10:20", title: "Hot Ruby on Rails Action", author: "GemMaster", badge: null, views: "600K views", rating: "88%" },
    { thumb: "https://images.unsplash.com/photo-1592609931095-54a2168ae893?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Coding", duration: "05:45", title: "Quickie: Fix that Bug in 5 minutes", author: "SpeedCoder", badge: "HD", views: "200K views", rating: "91%" },
    { thumb: "https://images.unsplash.com/photo-1629654297299-c8506221ca97?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Coding", duration: "18:00", title: "Naughty Node.js: Explaining the Event Loop", author: "AsyncAwaiter", badge: "1080p", views: "900K views", rating: "96%" },
    { thumb: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Hacker", duration: "07:30", title: "Gaping Security Hole Exploited by Teen", author: "WhiteHat69", badge: "4K", views: "3.5M views", rating: "98%" },
    { thumb: "https://images.unsplash.com/photo-1550439062-609e1531270e?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Data", duration: "14:20", title: "Injecting SQL into her tight Backend", author: "DB_Admin_XXX", badge: "HD", views: "800K views", rating: "94%" },
    { thumb: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Mobile Dev", duration: "22:00", title: "My Wife Caught Me Using PHP (SHOCKING)", author: "LaravelLover", badge: null, views: "1.1M views", rating: "85%" },
    { thumb: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Code", duration: "31:10", title: "Two Microservices, One Cup (Integration Hell)", author: "KubernetesKing", badge: "4K", views: "5M views", rating: "99%" },
    { thumb: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Matrix", duration: "03:50", title: "Solo Coder Touches Himself (Private Methods)", author: "OOp_Fanatic", badge: null, views: "400K views", rating: "90%" },
    { thumb: "https://images.unsplash.com/photo-1605379399642-870262d3d051?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Server", duration: "55:00", title: "Massive Load Balancing (Stress Test Compilation)", author: "DevOpsDaddy", badge: "HD", views: "150K views", rating: "93%" },
    { thumb: "https://images.unsplash.com/photo-1571171637578-41bc2dd41cd2?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Code Screen", duration: "19:45", title: "She Handles My Exception (Try-Catch Block)", author: "JavaJunkie", badge: "1080p", views: "2.1M views", rating: "96%" },
    { thumb: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", alt: "Analytics", duration: "11:11", title: "Caught Leaking Memory in Public", author: "C_Plus_Plus_Guy", badge: null, views: "950K views", rating: "89%" },
];

const promosLeft = [
    { img: "images/croissantFlou.png", alt: "Croissant", badge: "HOT DEAL", headline: "HOT SINGLES IN YOUR AREA", subtext: "They are flaky, buttery, and waiting for you.", cta: "EAT NOW &gt;" },
    { img: "images/mikadulte.png", alt: "Machine", badge: "SPONSORED", headline: "ENLARGE YOUR OUTPUT", subtext: "Devs hate him! This machine does the work of 10 interns.", cta: "GET HARDWARE &gt;" },
];

const promosRight = [
    { img: "images/degoulinant.png", alt: "Pile of Croissants", badge: "LIVE CAM", headline: "GROUP ACTION", subtext: "Satisfy your cravings with unlimited carbs tonight.", cta: "JOIN FOR FREE &gt;" },
    { img: "images/flouDARK CHOCOLATE.png", alt: "Machine 2", badge: "18+ ONLY", headline: "SHE WANTS YOUR RAM", subtext: "This AI assistant will do anything you ask. Anything.", cta: "CHAT NOW &gt;" },
];

// ---------- RENDER ----------
function videoCardHTML(v) {
    const badgeHTML = v.badge ? `<span class="hd-badge">${v.badge}</span>` : "";
    return `
        <div class="video-card group">
            <div class="thumbnail-container">
                <img src="${v.thumb}" alt="${v.alt}" class="w-full h-full object-cover" loading="lazy">
                <div class="duration-badge">${v.duration}</div>
                <div class="card-menu"><i class="fas fa-ellipsis-h"></i></div>
            </div>
            <div class="p-2">
                <h3 class="text-sm font-bold text-gray-200 leading-tight group-hover:text-ph-orange mb-1">${v.title}</h3>
                <div class="text-xs text-gray-500 mb-1">
                    <span class="hover:text-gray-300 cursor-pointer">${v.author}</span>
                    ${badgeHTML}
                </div>
                <div class="flex justify-between items-center text-xs text-gray-600">
                    <span>${v.views}</span>
                    <span>${v.rating}</span>
                </div>
            </div>
        </div>`;
}

function promoHTML(promo) {
    return `
        <a href="html/site/trap.html" class="block">
            <div class="promo-card">
                <span class="promo-tag">${promo.badge}</span>
                <img src="${promo.img}" alt="${promo.alt}" class="w-full h-48 object-cover" loading="lazy">
                <div class="promo-overlay">
                    <div class="promo-title">${promo.headline}</div>
                    <div class="promo-desc">${promo.subtext}</div>
                    <div class="promo-cta">${promo.cta}</div>
                </div>
            </div>
        </a>`;
}

document.getElementById("video-grid").innerHTML = videos.map(videoCardHTML).join("");
document.getElementById("promo-left").innerHTML = promosLeft.map(promoHTML).join("");
document.getElementById("promo-right").innerHTML = promosRight.map(promoHTML).join("");

// ---------- MODAL ----------
const videoModal = document.getElementById('video-modal');
const popupVideo = document.getElementById('popup-video');
const closeModalBtn = document.getElementById('close-modal');

// Delegate clicks on video cards (they're created dynamically)
document.getElementById("video-grid").addEventListener('click', (e) => {
    if (e.target.closest('.video-card')) {
        videoModal.classList.remove('hidden');
        popupVideo.play().catch(err => console.log("Autoplay bloqué:", err));
    }
});

const closeModal = () => {
    videoModal.classList.add('hidden');
    popupVideo.pause();
    popupVideo.currentTime = 0;
};

closeModalBtn.addEventListener('click', closeModal);

videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) closeModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !videoModal.classList.contains('hidden')) closeModal();
});
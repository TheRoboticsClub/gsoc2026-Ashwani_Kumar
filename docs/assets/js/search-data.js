// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/gsoc2026-Ashwani_Kumar/";
    },
  },{id: "nav-blog",
          title: "blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/gsoc2026-Ashwani_Kumar/blog/";
          },
        },{id: "post-week-2-one-click-one-new-universe",
        
          title: "Week 2 — One click, one new universe",
        
        description: "Following a single click from the React UI all the way to `ros2 launch` — and slipping a brand-new Palletizing Harmonic world into that pipeline along the way.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/gsoc2026-Ashwani_Kumar/blog/2026/week2-palletizing-universe/";
          
        },
      },{id: "post-hello-gsoc-2026",
        
          title: "Hello, GSoC 2026",
        
        description: "First post — kicking off my Google Summer of Code 2026 project on RoboticsAcademy @ JdeRobot.",
        section: "Posts",
        handler: () => {
          
            window.location.href = "/gsoc2026-Ashwani_Kumar/blog/2026/hello-gsoc/";
          
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/Ashwani1330", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/moudgilashwani", "_blank");
        },
      },{
        id: 'social-x',
        title: 'X',
        section: 'Socials',
        handler: () => {
          window.open("https://twitter.com/Ashwani1330", "_blank");
        },
      },{
        id: 'social-rss',
        title: 'RSS Feed',
        section: 'Socials',
        handler: () => {
          window.open("/gsoc2026-Ashwani_Kumar/feed.xml", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];

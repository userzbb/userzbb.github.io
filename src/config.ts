import type {
    SiteConfig,
    ProfileConfig,
    LicenseConfig,
} from "./types/config"
import type { FriendLink } from "./types/friend"
import type { I18nConfig } from "./types/i18n"

export const siteConfig: SiteConfig = {
    title: "zizimiku", // Title of the site, used in the tab in the browser and in SEO
    subTitle: "blog", // Subtitle of the site
    rootSiteUrl: "https://userzbb.github.io", // Root URL of the site, used for generating absolute URLs for SEO and social sharing

    favicon: "/favicon/favicon.ico", // Path of the favicon, relative to the /public directory

    pageSize: 6, // Number of posts per page
    toc: {
        enable: true,
        depth: 3 // Max depth of the table of contents, between 1 and 4
    },
    blogNavi: {
        enable: true // Whether to enable blog navigation in the blog footer
    },
    comments: {
        enable: true, // Whether to enable comments
        platform: "default", // Comment platform, set "default" to use Momo-backend, also supports "twikoo"
        backendUrl: "https://api-momo.motues.top" // Backend URL for comments
    },
    theme: {
        AOS: true, // Whether to enable AOS (Animate On Scroll) for animations
        LQIP: true, // Whether to enable LQIP (Low-Quality Image Placeholder) for image placeholders
        PhotoSwipe: true, // Whether to enable PhotoSwipe for image viewer
        postCard: {
            imageMode: "top" // Cover image mode for article cards: "top" shows the image above the content; "background" uses the image as the card background, fading to transparent from right to left
        }
    }
}

export const profileConfig: ProfileConfig = {
    avatar: "assets/konata.jpg", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
    name: "Konata", // Used in the footer of the blog
    description: "一只shark—cat", // Used in SEO
    indexPage: "https://github.com/userzbb", // The homepage, used in footer and SEO
    startYear: 2024, // The year the site was created, used in the footer
    links: [
        {
            name: "Twitter",
            url: "https://x.com/wild_zzb",
            icon: "fa6-brands:x-twitter",
            color: "#000000"
        },
        {
            name: "Steam",
            url: "https://steamcommunity.com/profiles/76561198364775937/",
            icon: "fa6-brands:steam",
            color: "#1b2838"
        },
        {
            name: "GitHub",
            url: "https://github.com/userzbb",
            icon: "fa6-brands:github",
            color: "#181717"
        },
        {
            name: "bilibili",
            url: "https://space.bilibili.com/36262002",
            icon: "fa6-brands:bilibili",
            color: "#00A1D6"
        },
        {
            name: "YouTube",
            url: "https://www.youtube.com/@bozh2584",
            icon: "fa6-brands:youtube",
            color: "#FF0000"
        },
    ],
}

export const licenseConfig: LicenseConfig = {
	enable: true, // Whether to enable license information
	name: "CC BY-NC-SA 4.0", // License name
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/", // License URL
};

export const i18nConfig: I18nConfig = {
    defaultLanguage: "zh-cn", // Default language of the site
    supportedLanguages: ["zh-cn", "en"], // List of supported languages
    translations: { // Translation content for each supported language
        "zh-cn": {
            Cover: {
                title: {
                    home: "欢迎来到 zizimiku 的博客",
                    archive: "文章归档",
                    about: "关于",
                    friends: "友链",
                },
                subTitle: {
                    home: "记录学习与折腾",
                    archive: "共 {count} 篇文章", // {count} will be replaced with the total number of articles
                    about: "一只shark—cat",
                    friends: "有趣的灵魂",
                }
            }
        },
        "en": {
            Cover: {
                title: {
                    home: "Welcome to zizimiku's Blog",
                    archive: "Archive",
                    about: "About",
                    friends: "Friends",
                },
                subTitle: {
                    home: "Learning and tinkering",
                    archive: "Total of {count} articles",
                    about: "A shark-cat",
                    friends: "Interesting Souls",
                }
            }
        }
    }
};

export const friendLinkConfig: FriendLink[] = [
    {
        name: 'Glacier', // Name of the friend link
        avatar: 'https://www.glac1er.top/favicon/icon.png', // Avatar image of the friend link
        url: 'http://glac1er.top', // URL of the friend link
        description: '如果你看到了这一样文字，请在源文件改成你想要的文字~' // Description of the friend link
    }
    // Add more friend links here
]

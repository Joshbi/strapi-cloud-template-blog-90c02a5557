const { createStrapi, compileStrapi } = require('@strapi/strapi');
const fs = require('fs');
const path = require('path');
const https = require('https');

async function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => { file.close(); resolve(filepath); });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => { file.close(); resolve(filepath); });
      }
    }).on('error', reject);
  });
}

async function uploadImage(app, filepath, name) {
  const file = {
    filepath,
    originalFilename: name,
    mimetype: 'image/jpeg',
    size: fs.statSync(filepath).size,
  };
  const [uploaded] = await app.plugin('upload').service('upload').upload({
    data: {},
    files: file,
  });
  return uploaded;
}

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'error';

  // 1. Download and upload placeholder images for hero + content-with-image
  const tmpDir = path.join(__dirname, '..', '.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const imageConfigs = [
    { url: 'https://picsum.photos/seed/contact-hero/1200/800', name: 'contact-hero.jpg' },
    { url: 'https://picsum.photos/seed/contact-studio/1000/800', name: 'contact-studio.jpg' },
  ];

  const uploadedImages = [];
  for (const img of imageConfigs) {
    const filepath = path.join(tmpDir, img.name);
    await downloadImage(img.url, filepath);
    const uploaded = await uploadImage(app, filepath, img.name);
    uploadedImages.push(uploaded);
    fs.unlinkSync(filepath);
  }

  const [heroImage, studioImage] = uploadedImages;

  // 2. Delete existing contact page if it exists (keeps the seed re-runnable)
  const existing = await app.documents('api::page.page').findMany({
    filters: { slug: 'contact' },
  });
  for (const entry of existing) {
    await app.documents('api::page.page').delete({ documentId: entry.documentId });
  }

  // 3. Create the contact page as a Page entry with blocks
  await app.documents('api::page.page').create({
    data: {
      title: 'Contact',
      slug: 'contact',
      description: 'Get in touch with our team. We would love to hear from you.',
      blocks: [
        {
          __component: 'blocks.hero',
          heading: 'Get in Touch',
          text: 'Have a question, a project in mind, or just want to say hello? We read every message and reply within one business day. Pick whichever channel works best for you.',
          image: heroImage.id,
          links: [
            { href: 'mailto:hello@spektrum.example', label: 'Email us', isExternal: true, type: 'PRIMARY' },
            { href: '#studio', label: 'Visit the studio', isExternal: false, type: 'SECONDARY' },
          ],
        },
        {
          __component: 'blocks.heading-section',
          heading: 'Ways to Reach Us',
          subHeading: 'Contact',
        },
        {
          __component: 'blocks.card-grid',
          card: [
            {
              heading: 'Email',
              text: 'hello@spektrum.example — For general enquiries, partnerships, and press. We usually reply within one business day.',
            },
            {
              heading: 'Phone',
              text: '+48 22 123 45 67 — Call us Monday to Friday between 9:00 and 17:00 CET. Voicemail is checked daily.',
            },
            {
              heading: 'Studio',
              text: 'ul. Marszałkowska 100, 00-026 Warsaw, Poland. Drop-ins welcome during open hours, or book a visit ahead of time.',
            },
            {
              heading: 'Open Hours',
              text: 'Monday – Friday, 9:00 – 18:00 CET. Closed on weekends and Polish public holidays.',
            },
          ],
        },
        {
          __component: 'blocks.content-with-image',
          heading: 'Visit our studio',
          text: 'Our Warsaw studio sits in the middle of Śródmieście, a short walk from Centrum metro station. Come by for a coffee, a workshop, or a design review — we love meeting the people behind the projects we build.',
          image: studioImage.id,
          link: {
            href: 'https://maps.google.com/?q=Marszalkowska+100+Warsaw',
            label: 'Open in Google Maps',
            isExternal: true,
          },
          reversed: false,
        },
        {
          __component: 'blocks.faqs',
          faq: [
            {
              heading: 'How quickly will I get a reply?',
              text: 'We aim to reply to every email within one business day. For urgent matters, a phone call during open hours is the fastest route.',
            },
            {
              heading: 'Can I drop by the studio without an appointment?',
              text: 'Yes, during open hours you are welcome to drop in. If you want to speak with a specific person, it is best to book ahead so we can make sure they are available.',
            },
            {
              heading: 'Do you take on new projects?',
              text: 'We usually do. Send us a short brief by email with your timeline, budget range, and goals, and we will get back to you with next steps.',
            },
            {
              heading: 'Where can I send press or partnership enquiries?',
              text: 'Email hello@spektrum.example with "Press" or "Partnership" in the subject line and we will route your message to the right person.',
            },
          ],
        },
      ],
    },
    status: 'published',
  });

  // 4. Add navigation link
  const global = await app.documents('api::global.global').findFirst({
    populate: { header: { populate: { logo: true, navItems: true, cta: true } } },
  });

  if (global) {
    const existingNavItems = global.header?.navItems || [];
    if (!existingNavItems.some((item) => item.href === '/contact')) {
      await app.documents('api::global.global').update({
        documentId: global.documentId,
        data: {
          header: {
            ...global.header,
            navItems: [
              ...existingNavItems,
              { href: '/contact', label: 'Contact', isExternal: false, isButtonLink: false },
            ],
          },
        },
        status: 'published',
      });
      console.log('Added "Contact" link to global navigation.');
    }
  }

  console.log('Seeded contact page with blocks and public permissions.');
  await app.destroy();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });

import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

def create_deck(output_path="d:/Freedemy/Freedemy-Presentation.pptx"):
    prs = Presentation()
    # 16:9 Widescreen
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)

    # Color Palette
    BG_DARK = RGBColor(11, 15, 25)        # #0b0f19
    CARD_BG = RGBColor(22, 29, 47)        # #161d2f
    CARD_BORDER = RGBColor(45, 55, 80)    # subtle border
    ACCENT_BLUE = RGBColor(39, 83, 255)   # #2753ff
    ACCENT_VIOLET = RGBColor(124, 58, 237)# #7c3aed
    TEXT_WHITE = RGBColor(255, 255, 255)
    TEXT_MUTED = RGBColor(156, 163, 175)  # #9ca3af
    TEXT_DIM = RGBColor(107, 114, 128)    # #6b7280
    ACCENT_GREEN = RGBColor(16, 185, 129) # #10b981

    blank_layout = prs.slide_layouts[6]

    def set_slide_bg(slide):
        bg = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, prs.slide_height)
        bg.fill.solid()
        bg.fill.fore_color.rgb = BG_DARK
        bg.line.fill.background()
        return bg

    def add_header(slide, tag, title, subtitle=None):
        tb = slide.shapes.add_textbox(Inches(0.8), Inches(0.6), Inches(11.7), Inches(1.3))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p_tag = tf.paragraphs[0]
        p_tag.text = tag.upper()
        p_tag.font.size = Pt(11)
        p_tag.font.bold = True
        p_tag.font.color.rgb = ACCENT_VIOLET

        p_title = tf.add_paragraph()
        p_title.text = title
        p_title.font.size = Pt(26)
        p_title.font.bold = True
        p_title.font.color.rgb = TEXT_WHITE
        p_title.space_before = Pt(4)

        if subtitle:
            p_sub = tf.add_paragraph()
            p_sub.text = subtitle
            p_sub.font.size = Pt(13)
            p_sub.font.color.rgb = TEXT_MUTED
            p_sub.space_before = Pt(4)

    # -------------------------------------------------------------
    # SLIDE 1: Problem Statement
    # -------------------------------------------------------------
    s1 = prs.slides.add_slide(blank_layout)
    set_slide_bg(s1)
    add_header(s1, "Problem Statement", "The YouTube Learning Trap", "Millions study from YouTube daily, but passive watching rarely leads to actual retention.")

    problems = [
        ("Passive Consumption", "Students binge hours of tutorials without active recall or comprehension checks, leading to the illusion of competence."),
        ("Zero Structure & Navigation", "Multi-hour lectures lack granular interactive checkpoints, structured notes, or instant ways to assess understanding."),
        ("No Instant Help or Context", "When stuck, students re-watch or scour comment sections. General chatbots lack exact lecture transcript grounding.")
    ]

    card_w = Inches(3.64)
    card_h = Inches(4.5)
    gap = Inches(0.4)
    start_x = Inches(0.8)
    top_y = Inches(2.2)

    for i, (ptitle, pdesc) in enumerate(problems):
        x = start_x + i * (card_w + gap)
        card = s1.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top_y, card_w, card_h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        # Number badge
        nb = s1.shapes.add_textbox(x + Inches(0.3), top_y + Inches(0.3), Inches(0.8), Inches(0.5))
        ntf = nb.text_frame
        np = ntf.paragraphs[0]
        np.text = f"0{i+1}"
        np.font.size = Pt(20)
        np.font.bold = True
        np.font.color.rgb = ACCENT_BLUE

        # Text inside card
        tb = s1.shapes.add_textbox(x + Inches(0.3), top_y + Inches(1.0), card_w - Inches(0.6), Inches(3.0))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = ptitle
        p1.font.size = Pt(18)
        p1.font.bold = True
        p1.font.color.rgb = TEXT_WHITE
        p1.space_after = Pt(12)

        p2 = tf.add_paragraph()
        p2.text = pdesc
        p2.font.size = Pt(13)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 2: Proposed Solution
    # -------------------------------------------------------------
    s2 = prs.slides.add_slide(blank_layout)
    set_slide_bg(s2)
    add_header(s2, "Proposed Solution", "Freedemy: Active Learning from Any Lecture", "Turn any YouTube URL into an active, chaptered, and fully graded mini-course in seconds.")

    solutions = [
        ("Modular Chaptering", "Automatically breaks lengthy videos into digestible, timestamped concepts with synopses and clear learning objectives."),
        ("Active Assignments & Quizzes", "Dynamic MCQs and code/knowledge checks for each section. Immediate grading with smart feedback."),
        ("Wrong-Answer Video Rewind", "Missed a concept? Freedemy links directly back to the exact video timestamp so you can re-watch and master it."),
        ("Transcript-Grounded Tutor", "Section-scoped AI tutor that answers strictly from the lecture transcript, preventing hallucinations.")
    ]

    card2_w = Inches(5.66)
    card2_h = Inches(2.1)
    for i, (stitle, sdesc) in enumerate(solutions):
        row = i // 2
        col = i % 2
        x = start_x + col * (card2_w + Inches(0.4))
        y = top_y + row * (card2_h + Inches(0.3))

        card = s2.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, card2_w, card2_h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        tb = s2.shapes.add_textbox(x + Inches(0.3), y + Inches(0.3), card2_w - Inches(0.6), Inches(1.5))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = stitle
        p1.font.size = Pt(16)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_BLUE
        p1.space_after = Pt(6)

        p2 = tf.add_paragraph()
        p2.text = sdesc
        p2.font.size = Pt(12)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 3: How the Solution Works
    # -------------------------------------------------------------
    s3 = prs.slides.add_slide(blank_layout)
    set_slide_bg(s3)
    add_header(s3, "Architecture & Workflow", "How Freedemy Works", "An automated, pipeline-driven engine from video URL to structured interactive mastery.")

    steps = [
        ("1. Ingestion", "User pastes a YouTube URL. Video metadata & transcript are extracted asynchronously."),
        ("2. AI Structuring", "AI segments the transcript into coherent chapters, detailed notes, and focused sub-topics."),
        ("3. Assessment Engine", "Generates targeted quizzes, assignments, and test criteria based purely on transcript facts."),
        ("4. Interactive Delivery", "Seamless Next.js workspace: video player synced with notes, interactive quiz runner, and AI tutor.")
    ]

    s3_w = Inches(2.68)
    s3_h = Inches(4.5)
    s3_gap = Inches(0.32)

    for i, (st, sd) in enumerate(steps):
        x = start_x + i * (s3_w + s3_gap)
        card = s3.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top_y, s3_w, s3_h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        tb = s3.shapes.add_textbox(x + Inches(0.25), top_y + Inches(0.3), s3_w - Inches(0.5), Inches(3.8))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = st
        p1.font.size = Pt(16)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_VIOLET
        p1.space_after = Pt(10)

        p2 = tf.add_paragraph()
        p2.text = sd
        p2.font.size = Pt(12.5)
        p2.font.color.rgb = TEXT_MUTED

    # -------------------------------------------------------------
    # SLIDE 4: Team Background / Developer Intro
    # -------------------------------------------------------------
    s4 = prs.slides.add_slide(blank_layout)
    set_slide_bg(s4)
    add_header(s4, "Team Background", "Solo Developer Introduction", "Built independently for YUNet AIGnite Buildathon 2026.")

    # Left Card: Bio
    bio_w = Inches(5.66)
    bio_h = Inches(4.5)
    card_bio = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, start_x, top_y, bio_w, bio_h)
    card_bio.fill.solid()
    card_bio.fill.fore_color.rgb = CARD_BG
    card_bio.line.color.rgb = CARD_BORDER
    card_bio.line.width = Pt(1)

    tb = s4.shapes.add_textbox(start_x + Inches(0.4), top_y + Inches(0.4), bio_w - Inches(0.8), bio_h - Inches(0.8))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

    p_name = tf.paragraphs[0]
    p_name.text = "Nashwan Hasan"
    p_name.font.size = Pt(22)
    p_name.font.bold = True
    p_name.font.color.rgb = TEXT_WHITE

    p_role = tf.add_paragraph()
    p_role.text = "Solo Creator & Full-Stack Builder | Bangladesh"
    p_role.font.size = Pt(13)
    p_role.font.color.rgb = ACCENT_BLUE
    p_role.space_before = Pt(4)
    p_role.space_after = Pt(14)

    p_desc = tf.add_paragraph()
    p_desc.text = "Passionate about creating modern, accessible AI solutions that empower self-learners and students. Built Freedemy end-to-end—from concept, design systems, and frontend UX to full-stack pipelines and AI assessment integration."
    p_desc.font.size = Pt(13)
    p_desc.font.color.rgb = TEXT_MUTED
    p_desc.space_after = Pt(12)

    p_contact = tf.add_paragraph()
    p_contact.text = "• Email: nashwan.hasan06@gmail.com\n• GitHub: github.com/nashwanhasan06/freedemy"
    p_contact.font.size = Pt(12)
    p_contact.font.color.rgb = TEXT_WHITE

    # Right Card: Capabilities & Focus
    card_right = s4.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, start_x + bio_w + Inches(0.4), top_y, bio_w, bio_h)
    card_right.fill.solid()
    card_right.fill.fore_color.rgb = CARD_BG
    card_right.line.color.rgb = CARD_BORDER
    card_right.line.width = Pt(1)

    tb_r = s4.shapes.add_textbox(start_x + bio_w + Inches(0.8), top_y + Inches(0.4), bio_w - Inches(0.8), bio_h - Inches(0.8))
    tf_r = tb_r.text_frame
    tf_r.word_wrap = True
    tf_r.margin_left = tf_r.margin_top = tf_r.margin_right = tf_r.margin_bottom = 0

    pr_h = tf_r.paragraphs[0]
    pr_h.text = "Development Focus & Execution"
    pr_h.font.size = Pt(20)
    pr_h.font.bold = True
    pr_h.font.color.rgb = TEXT_WHITE
    pr_h.space_after = Pt(14)

    bullet_points = [
        "Single-handed conception, UI/UX design, and implementation within the hackathon timeframe.",
        "Deep focus on user delight: sub-second interactions, fluid animations, and clear typography.",
        "Student-first empathy: Designed to solve the real frustration of passive video consumption.",
        "Engineered for reliability: Graceful fallbacks, progress persistence, and strict transcript guardrails."
    ]
    for bp in bullet_points:
        p = tf_r.add_paragraph()
        p.text = "✔  " + bp
        p.font.size = Pt(12.5)
        p.font.color.rgb = TEXT_MUTED
        p.space_after = Pt(8)

    # -------------------------------------------------------------
    # SLIDE 5: Key Info & Product Highlights
    # -------------------------------------------------------------
    s5 = prs.slides.add_slide(blank_layout)
    set_slide_bg(s5)
    add_header(s5, "Product Details", "Key Information & Future Vision", "Everything judges need to know about the product's viability and future.")

    # 3 horizontal columns
    c5_w = Inches(3.64)
    c5_h = Inches(4.5)

    info_blocks = [
        ("Tech Stack & Architecture", [
            ("Framework", "Next.js 16 (App Router & Turbopack)"),
            ("Styling", "Tailwind CSS v4 & custom design tokens"),
            ("Visuals", "WebGL interactive WebThreads & canvas"),
            ("Database & Auth", "Supabase SSR & PostgreSQL"),
            ("AI Layer", "Structured prompt chains & transcript parsing")
        ]),
        ("Key Differentiators", [
            ("Direct Video Sync", "Instant jumps to video moments when a quiz question is failed."),
            ("Zero Friction", "No complex setups—paste any lecture and learn."),
            ("Context-Bound Tutor", "AI never hallucinates outside the lecture content."),
            ("Progress Tracking", "Comprehensive chapter scores & assignment audits.")
        ]),
        ("Roadmap & Future", [
            ("Multi-lecture Playlists", "Turn full university modules into complete curricula."),
            ("Voice AI Q&A", "Voice-to-voice interaction directly with lecture content."),
            ("Peer Study Groups", "Collaborative quizzes & flashcard competitions."),
            ("Submission Ready", "Open-source, self-hostable, and cloud-deployable.")
        ])
    ]

    for i, (col_title, items) in enumerate(info_blocks):
        x = start_x + i * (c5_w + gap)
        card = s5.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, top_y, c5_w, c5_h)
        card.fill.solid()
        card.fill.fore_color.rgb = CARD_BG
        card.line.color.rgb = CARD_BORDER
        card.line.width = Pt(1)

        tb = s5.shapes.add_textbox(x + Inches(0.3), top_y + Inches(0.3), c5_w - Inches(0.6), c5_h - Inches(0.6))
        tf = tb.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        p1 = tf.paragraphs[0]
        p1.text = col_title
        p1.font.size = Pt(16)
        p1.font.bold = True
        p1.font.color.rgb = ACCENT_BLUE
        p1.space_after = Pt(12)

        for label, val in items:
            p = tf.add_paragraph()
            p.text = f"{label}: "
            p.font.bold = True
            p.font.size = Pt(11.5)
            p.font.color.rgb = TEXT_WHITE
            
            # value part
            p2_span = p.add_run()
            p2_span.text = val
            p2_span.font.bold = False
            p2_span.font.color.rgb = TEXT_MUTED
            p.space_after = Pt(8)

    prs.save(output_path)
    print(f"Presentation saved successfully to: {output_path}")

if __name__ == "__main__":
    create_deck()


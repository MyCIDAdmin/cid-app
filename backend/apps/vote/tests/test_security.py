"""Tests — anonymat HMAC-SHA256 (SCD §7.5)."""

from apps.vote.security import compute_voter_token, generer_anonymat_sel


def test_sel_est_une_chaine_hex_de_64_caracteres():
    sel = generer_anonymat_sel()
    assert len(sel) == 64
    int(sel, 16)  # lève ValueError si ce n'est pas de l'hexadécimal


def test_deux_sels_generes_sont_differents():
    assert generer_anonymat_sel() != generer_anonymat_sel()


def test_token_deterministe_pour_meme_membre_et_session():
    sel = generer_anonymat_sel()
    t1 = compute_voter_token("membre-1", "session-1", sel)
    t2 = compute_voter_token("membre-1", "session-1", sel)
    assert t1 == t2


def test_token_differe_selon_le_membre():
    sel = generer_anonymat_sel()
    t1 = compute_voter_token("membre-1", "session-1", sel)
    t2 = compute_voter_token("membre-2", "session-1", sel)
    assert t1 != t2


def test_token_differe_selon_la_session():
    sel = generer_anonymat_sel()
    t1 = compute_voter_token("membre-1", "session-1", sel)
    t2 = compute_voter_token("membre-1", "session-2", sel)
    assert t1 != t2


def test_meme_membre_deux_sessions_differentes_sels_aucune_correlation():
    """Deux sessions ont chacune leur propre sel : un même membre y produit des tokens
    sans aucune corrélation calculable entre les deux (SCD §7.5)."""
    sel_a = generer_anonymat_sel()
    sel_b = generer_anonymat_sel()
    t_a = compute_voter_token("membre-1", "session-A", sel_a)
    t_b = compute_voter_token("membre-1", "session-B", sel_b)
    assert t_a != t_b


def test_token_est_irreversible_sans_le_sel():
    """Le token ne permet, sans connaître le sel, de retrouver ni le membre_id ni la
    session_id (propriété structurelle de HMAC-SHA256 — ce test vérifie a minima que le
    token ne contient literallement pas les identifiants en clair)."""
    token = compute_voter_token("membre-secret-id", "session-secret-id", generer_anonymat_sel())
    assert "membre-secret-id" not in token
    assert "session-secret-id" not in token
    assert len(token) == 64  # sortie hexadécimale SHA-256

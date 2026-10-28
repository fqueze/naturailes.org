<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0">
 <xsl:template match="/">
&lt;!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd"&gt;
<html>
<head>
 <title>Natur'Ailes.org</title>
 <meta name="description" content="Site des photos de Daniel Quèze" />
 <meta name="author" content="Daniel &amp; Florian Quèze" />
 <meta http-equiv="content-type" content="text/html; charset=UTF-8" />
 <link rel="stylesheet" type="text/css" href="css.css" />
 <script language="javascript" src="xsl_mop-up.js"/>
</head>
<body onload="go_decoding();">
  <div id="cometestme" style="display:none;">
   <xsl:text disable-output-escaping="yes" >&amp;amp;</xsl:text>
  </div>

 <div class="titre">
  <h1 class="bigtitre">
   <img src="img/titre.jpg" height="70" alt="Natur'Ailes.org" />
  </h1>
 </div>

  <xsl:for-each select="rss/channel/item">
   <div class="post" name="decodeable">
    &lt;h1&gt;<xsl:value-of select="title" />&lt;/h1&gt;
    <xsl:value-of select="description" disable-output-escaping="yes" />
   </div>
  </xsl:for-each>

<div class="nav">
<a href="/">Accueil</a>

<h1>Catégories</h1>
<ul class="cat">
 <li><a href="t5-passereaux.html" title="photos faites sur une branche placée à côté d'un distributeur de graines">passereaux</a> : (145)</li>
 <li><a href="t9-animaux-du-marais.html" title="canards, foulques, poules d'eau, et autres bestioles">animaux du marais</a> : (142)</li>
 <li><a href="t10-plantes-et-fleurs.html">plantes et fleurs</a> : (78)</li>
 <li><a href="t8-graphismes.html" title="photos bizarres et essais divers">graphismes</a> : (74)</li>
 <li><a href="t11-animaux-de-compagnie.html">animaux de compagnie</a> : (44)</li>
 <li><a href="t3-insectes.html">insectes</a> : (43)</li>
 <li><a href="t4-cygnes.html">cygnes</a> : (39)</li>
 <li><a href="t6-equides.html">équidés</a> : (37)</li>
 <li><a href="t16-nausicaa.html" title="visite au Centre national de la Mer - Boulogne sur mer - www.nasicaa.fr">Nausicaa</a> : (32)</li>
 <li><a href="t7-herons.html">hérons</a> : (27)</li>
 <li><a href="t15-lagomorphes-lapins-etc.html">lagomorphes (lapins etc...)</a> : (22)</li>
 <li><a href="t12-divers.html">divers</a> : (18)</li>
 <li><a href="t17-rapaces.html">rapaces</a> : (17)</li>
 <li><a href="t14-paysages.html">paysages</a> : (9)</li>
 <li><a href="t13-mouettes.html">mouettes</a> : (8)</li>
</ul>
<a href="mailto:naturailes@queze.net">Nous écrire</a><br /><br />
Copyright : <a href="mailto:daniel@naturailes.org" style="display:inline;">Daniel</a> et <a href="mailto:florian@naturailes.org" style="display:inline;">Florian</a> Quèze - 2005-2010
</div>
</body>
</html>
 </xsl:template>
</xsl:stylesheet>
